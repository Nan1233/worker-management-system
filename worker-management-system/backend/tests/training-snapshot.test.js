'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSnapshot,
  getReportTrainingSnapshot,
  resolveInitialTrainingSnapshot,
  assertTrainingSnapshotAvailable
} = require('../services/trainingSnapshotService');
const { calculateProductionMetrics } = require('../domain/productionCalculationEngine.cjs');
const { classifyTrainingSnapshotRow } = require('../services/trainingSnapshotAuditService');

function workerQuery(trainingPercent) {
  return async (sql, params) => {
    assert.match(sql, /SELECT training_percent FROM workers/);
    assert.deepEqual(params, [7]);
    return [{ training_percent: trainingPercent }];
  };
}

for (const value of [0, 50, 100]) {
  test(`initial server snapshot preserves ${value}%`, async () => {
    assert.equal(await resolveInitialTrainingSnapshot({ workerId: 7, query: workerQuery(value) }), value);
  });
}

test('missing worker training uses canonical 100% default', async () => {
  assert.equal(await resolveInitialTrainingSnapshot({ workerId: 7, query: workerQuery(null) }), 100);
  assert.equal(normalizeSnapshot(''), 100);
});

test('client training value cannot override server snapshot authority', async () => {
  const clientPayload = { training_percent: 100 };
  const snapshot = await resolveInitialTrainingSnapshot({ workerId: 7, query: workerQuery(50) });
  assert.equal(snapshot, 50);
  assert.equal(clientPayload.training_percent, 100);
});

test('report snapshot has priority over mutable legacy/current worker training value', () => {
  assert.equal(getReportTrainingSnapshot({ training_percent_snapshot: 50, training_percent: 100 }), 50);
});

test('historical calculation remains stable after worker master conceptually changes 50→100', () => {
  const base = {
    training_percent_snapshot: 50,
    training_percent: 100,
    actual_output: 100,
    tt_ok: 100,
    tt_ng: 0,
    actual_time: 2,
    total_time: 2,
    deduction_time: 0,
    standard_output: 20,
    defects: []
  };
  const first = calculateProductionMetrics(base);
  const afterMasterChange = calculateProductionMetrics({ ...base, training_percent: 100 });
  assert.equal(first.trainingPercent, 50);
  assert.equal(first.adjustedOutput, 50);
  assert.equal(first.outputPerHour, 25);
  assert.equal(first.achievement, 1.25);
  assert.deepEqual(afterMasterChange, first);
});

test('legacy null snapshot is explicit and does not silently use current worker value', () => {
  assert.equal(getReportTrainingSnapshot({ training_percent_snapshot: null, training_percent: 100 }), null);
  assert.throws(
    () => assertTrainingSnapshotAvailable({ training_percent_snapshot: null, training_percent: 100 }),
    (error) => error.code === 'TRAINING_SNAPSHOT_MISSING' && error.status === 422
  );
  const metrics = calculateProductionMetrics({
    training_percent_snapshot: null,
    training_percent: 100,
    actual_output: 100,
    tt_ok: 100,
    tt_ng: 0,
    actual_time: 2,
    total_time: 2,
    standard_output: 20,
    defects: []
  });
  assert.equal(metrics.trainingPercent, null);
  assert.equal(metrics.adjustedOutput, null);
  assert.equal(metrics.achievement, null);
  assert.equal(metrics.trainingSnapshotAvailable, false);
});

test('scanner classifies missing historical snapshot as review required, never auto-repair safe from current master alone', () => {
  const finding = classifyTrainingSnapshotRow({
    report_type: 'approved', report_id: 11, work_date: '2026-08-01', worker_id: 7,
    training_percent_snapshot: null, current_training_percent: 100
  });
  assert.equal(finding.classification, 'REVIEW_REQUIRED');
  assert.match(finding.reason, /MISSING_TRAINING_SNAPSHOT/);
});

const {
  inspectTrainingSnapshotSchemas,
  auditTrainingSnapshotSchema
} = require('../services/trainingSnapshotAuditService');

function healthyTrainingSchema() {
  return {
    production_reports_temp: [
      { Field: 'id', Type: 'bigint' },
      { Field: 'training_percent_snapshot', Type: 'decimal(7,2)' }
    ],
    production_reports: [
      { Field: 'id', Type: 'bigint' },
      { Field: 'training_percent_snapshot', Type: 'decimal(7,2)' }
    ]
  };
}

test('training scanner healthy schema has no TRAINING_SCHEMA_INCONSISTENCY', () => {
  assert.deepEqual(inspectTrainingSnapshotSchemas(healthyTrainingSchema()), []);
});

test('training scanner classifies missing snapshot column as TRAINING_SCHEMA_INCONSISTENCY', () => {
  const schema = healthyTrainingSchema();
  schema.production_reports_temp = [{ Field: 'id', Type: 'bigint' }];
  const findings = inspectTrainingSnapshotSchemas(schema);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].reason, 'TRAINING_SCHEMA_INCONSISTENCY');
  assert.equal(findings[0].issue, 'SNAPSHOT_COLUMN_MISSING');
  assert.equal(findings[0].classification, 'REVIEW_REQUIRED');
});

test('training scanner detects temp/approved schema asymmetry', () => {
  const schema = healthyTrainingSchema();
  schema.production_reports = [{ Field: 'id', Type: 'bigint' }];
  const findings = inspectTrainingSnapshotSchemas(schema);
  assert.ok(findings.some((finding) => finding.table === 'production_reports' && finding.issue === 'SNAPSHOT_COLUMN_MISSING'));
  assert.ok(findings.every((finding) => finding.classification !== 'AUTO_REPAIR_SAFE'));
});

test('training scanner detects incompatible snapshot type', () => {
  const schema = healthyTrainingSchema();
  schema.production_reports[1] = { Field: 'training_percent_snapshot', Type: 'int' };
  const findings = inspectTrainingSnapshotSchemas(schema);
  assert.ok(findings.some((finding) => finding.issue === 'SNAPSHOT_COLUMN_TYPE_INCOMPATIBLE'));
  assert.ok(findings.some((finding) => finding.issue === 'TEMP_APPROVED_SNAPSHOT_SCHEMA_MISMATCH'));
});

test('row NULL with healthy schema is MISSING_TRAINING_SNAPSHOT, not schema inconsistency', () => {
  assert.deepEqual(inspectTrainingSnapshotSchemas(healthyTrainingSchema()), []);
  const finding = classifyTrainingSnapshotRow({
    report_type: 'temp', report_id: 22, work_date: '2026-08-02', worker_id: 8,
    training_percent_snapshot: null, current_training_percent: 50
  });
  assert.match(finding.reason, /MISSING_TRAINING_SNAPSHOT/);
  assert.notEqual(finding.reason, 'TRAINING_SCHEMA_INCONSISTENCY');
});

test('runtime schema audit uses read-only SHOW COLUMNS metadata queries only', async () => {
  const calls = [];
  const schema = healthyTrainingSchema();
  const result = await auditTrainingSnapshotSchema(async (sql) => {
    calls.push(sql);
    const table = /FROM\s+(production_reports_temp|production_reports)/i.exec(sql)?.[1];
    return schema[table];
  });
  assert.deepEqual(result.findings, []);
  assert.deepEqual(calls, [
    'SHOW COLUMNS FROM production_reports_temp',
    'SHOW COLUMNS FROM production_reports'
  ]);
  assert.ok(calls.every((sql) => /^SHOW COLUMNS FROM /i.test(sql)));
});
