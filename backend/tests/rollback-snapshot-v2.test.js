const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  APPROVED_SNAPSHOT_SCHEMA_VERSION,
  loadApprovedAggregateSnapshot,
  validateApprovedVersionSnapshot,
  classifyApprovedVersionSnapshot
} = require('../services/approvedVersionSnapshotService');
const { auditRollbackVersions } = require('../services/rollbackVersionAuditService');

function createExecutor(fixtures) {
  return {
    async query(sql) {
      if (/FROM production_reports WHERE id=/i.test(sql)) return [[fixtures.report], []];
      if (/FROM production_report_defects/i.test(sql)) return [fixtures.defects, []];
      if (/FROM production_report_deductions/i.test(sql)) return [fixtures.deductions, []];
      if (/FROM production_report_machine_defects/i.test(sql)) return [fixtures.machineDefects, []];
      if (/FROM production_report_machine_lines/i.test(sql)) return [fixtures.machineLines, []];
      if (/FROM report_versions/i.test(sql)) return [fixtures.versions || [], []];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
}

function fixture(overrides = {}) {
  return {
    report: {
      id: 9, source_temp_id: 3, worker_id: 101, process_id: 4,
      work_date: '2026-08-10', entry_date: '2026-08-10', shift: 'A',
      operation_type: 'CUT', operation_mode: 'MACHINE', machine_no: '5', product_name: 'PX',
      total_time: '8.5000', actual_time: '8.0000', deduction_time: '0.5000',
      standard_output: '617.100000', standard_version_id: null, machine_standard_id: null,
      training_percent_snapshot: '50.00', exclude_kqd_from_tt_snapshot: 1,
      actual_output: '1000.000000', tt_ok: 990, tt_ng: 10,
      note: 'n', extra_data: '{"source":"worker"}', status: 'approved', review_note: null,
      created_at: 'ignore', updated_at: 'ignore', updated_by: 77,
      ...overrides.report
    },
    defects: overrides.defects || [
      { id: 8, defect_type_id: 2, quantity: 6 },
      { id: 9, defect_type_id: 5, quantity: 4 }
    ],
    deductions: overrides.deductions || [
      { id: 3, deduction_type_id: 4, hours: '0.5000' }
    ],
    machineLines: overrides.machineLines || [
      {
        id: 12, report_id: 9, machine_event_id: 100, machine_id: 5, machine_code: '5',
        product_standard_id: 44, standard_version_id: 61, machine_standard_id: null, product_code: 'PX',
        machine_time_hours: '8.0000', standard_output: '617.100000', standard_time_seconds: '5.833900',
        standard_source: 'PRODUCT', exclude_kqd_from_tt: 1,
        ok_quantity: 990, ng_quantity: 10, maximum_output: '4936.800000', deduction_time_hours: '0.0000',
        deductions_json: '[]', counted_output: '996.000000', earned_standard_hours: '1.613900',
        defects_json: '[{"defect_code":"KQD","quantity":4}]', sort_order: 1,
        created_at: 'ignore'
      }
    ],
    machineDefects: overrides.machineDefects || [
      { machine_line_id: 12, defect_type_id: 5, defect_code: 'KQD', defect_name: 'KQD', quantity: 4 },
      { machine_line_id: 12, defect_type_id: 2, defect_code: 'RACH', defect_name: 'Rách', quantity: 6 }
    ],
    versions: overrides.versions || []
  };
}

test('canonical approved snapshot v2 captures complete report aggregate without physical event truth', async () => {
  const data = fixture();
  const snapshot = await loadApprovedAggregateSnapshot({ reportId: 9, executor: createExecutor(data) });
  assert.equal(snapshot.schemaVersion, APPROVED_SNAPSHOT_SCHEMA_VERSION);
  assert.equal(snapshot.report.id, 9);
  assert.equal(snapshot.report.standard_output, '617.100000');
  assert.equal(snapshot.report.training_percent_snapshot, '50.00');
  assert.equal(snapshot.report.exclude_kqd_from_tt_snapshot, 1);
  assert.equal(snapshot.report.created_at, undefined);
  assert.deepEqual(snapshot.defects.map((x) => x.defect_type_id), [2, 5]);
  assert.deepEqual(snapshot.deductions.map((x) => x.deduction_type_id), [4]);
  assert.equal(snapshot.machineLines.length, 1);
  assert.equal(snapshot.machineLines[0].line.machine_event_id, 100);
  assert.equal(snapshot.machineLines[0].line.standard_version_id, 61);
  assert.equal(snapshot.machineLines[0].line.standard_output, '617.100000');
  assert.deepEqual(snapshot.machineLines[0].defects.map((x) => x.defect_code), ['KQD', 'RACH']);
  assert.equal(JSON.stringify(snapshot).includes('physical_counted_output'), false);
  assert.equal(JSON.stringify(snapshot).includes('machine_production_events'), false);
});

test('canonical snapshot preserves zero training and decimal standard values exactly as stored', async () => {
  const data = fixture({ report: { training_percent_snapshot: '0.00', standard_output: '900.770000' } });
  const snapshot = await loadApprovedAggregateSnapshot({ reportId: 9, executor: createExecutor(data) });
  assert.equal(snapshot.report.training_percent_snapshot, '0.00');
  assert.equal(snapshot.report.standard_output, '900.770000');
});

test('v2 validator accepts complete aggregate and permits nullable machine standard identity', async () => {
  const snapshot = await loadApprovedAggregateSnapshot({ reportId: 9, executor: createExecutor(fixture()) });
  const result = validateApprovedVersionSnapshot(snapshot);
  assert.equal(result.valid, true, JSON.stringify(result.issues));
});

test('v2 validator rejects missing machineLines instead of normalizing it to empty', async () => {
  const snapshot = await loadApprovedAggregateSnapshot({ reportId: 9, executor: createExecutor(fixture()) });
  delete snapshot.machineLines;
  const result = validateApprovedVersionSnapshot(snapshot);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((x) => x.code === 'ROLLBACK_CHILD_GRAPH_INCOMPLETE' && x.path === 'machineLines'));
});

test('v2 validator classifies missing training and KQD historical evidence', async () => {
  const snapshot = await loadApprovedAggregateSnapshot({ reportId: 9, executor: createExecutor(fixture()) });
  snapshot.report.training_percent_snapshot = null;
  snapshot.report.exclude_kqd_from_tt_snapshot = null;
  const result = validateApprovedVersionSnapshot(snapshot);
  assert.ok(result.issues.some((x) => x.code === 'ROLLBACK_MISSING_TRAINING_SNAPSHOT'));
  assert.ok(result.issues.some((x) => x.code === 'ROLLBACK_MISSING_KQD_POLICY'));
});

test('v2 validator rejects malformed machine event reference structurally', async () => {
  const snapshot = await loadApprovedAggregateSnapshot({ reportId: 9, executor: createExecutor(fixture()) });
  snapshot.machineLines[0].line.machine_event_id = 'not-an-id';
  const result = validateApprovedVersionSnapshot(snapshot);
  assert.ok(result.issues.some((x) => x.code === 'ROLLBACK_EVENT_LINK_UNKNOWN'));
});

test('legacy parent-only snapshot is REVIEW_REQUIRED and never auto-upgraded to v2', () => {
  const legacy = {
    id: 9, worker_id: 101, process_id: 4, standard_output: 617.1,
    defects: [], deductions: []
  };
  const result = classifyApprovedVersionSnapshot(legacy);
  assert.equal(result.classification, 'REVIEW_REQUIRED');
  assert.equal(result.restore_safe, 'REVIEW');
  assert.ok(result.reasons.includes('ROLLBACK_PARENT_ONLY_VERSION'));
  assert.ok(result.reasons.includes('ROLLBACK_CHILD_GRAPH_INCOMPLETE'));
  assert.ok(result.reasons.includes('ROLLBACK_MISSING_TRAINING_SNAPSHOT'));
  assert.ok(result.reasons.includes('ROLLBACK_MISSING_KQD_POLICY'));
  assert.ok(result.reasons.includes('ROLLBACK_EVENT_LINK_UNKNOWN'));
});

test('modern valid v2 snapshot is RESTORE_SAFE classification', async () => {
  const snapshot = await loadApprovedAggregateSnapshot({ reportId: 9, executor: createExecutor(fixture()) });
  const result = classifyApprovedVersionSnapshot(snapshot);
  assert.deepEqual(result, {
    classification: 'RESTORE_SAFE', restore_safe: 'YES', schema_version: 2,
    missing_components: [], reasons: []
  });
});

test('rollback audit scanner is read-only and reports structured classifications', async () => {
  const snapshot = await loadApprovedAggregateSnapshot({ reportId: 9, executor: createExecutor(fixture()) });
  const data = fixture({ versions: [
    { report_id: 9, version_no: 1, created_at: '2026-08-12', snapshot_json: JSON.stringify(snapshot) },
    { report_id: 9, version_no: 2, created_at: '2026-08-12', snapshot_json: JSON.stringify({ id: 9 }) }
  ] });
  const findings = await auditRollbackVersions({ executor: createExecutor(data) });
  assert.equal(findings.length, 2);
  assert.equal(findings[0].restore_safe, 'YES');
  assert.equal(findings[1].classification, 'REVIEW_REQUIRED');

  const scanner = fs.readFileSync(path.join(__dirname, '../scripts/auditRollbackVersions.js'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '../services/rollbackVersionAuditService.js'), 'utf8');
  for (const source of [scanner, service]) {
    assert.doesNotMatch(source, /\b(?:UPDATE|DELETE|INSERT|ALTER)\b\s+(?:TABLE|FROM|INTO|report_versions|production_)/i);
  }
});

test('all approved report version creation paths use canonical v2 version creator', () => {
  const files = [
    '../services/approvedReportEditService.js',
    '../services/approvedReportExcelCreateService.js',
    '../models/productionTempApprovalModel.js',
    '../controllers/productionController.js',
    '../controllers/systemController.js'
  ];
  for (const relative of files) {
    const source = fs.readFileSync(path.join(__dirname, relative), 'utf8');
    assert.match(source, /createApprovedReportVersion/);
    assert.doesNotMatch(source, /AuditService\.createReportVersion\(\s*\{\s*reportType\s*:\s*['"]approved['"]/);
  }
});

test('report_versions remains append-only in active backend code', () => {
  const root = path.join(__dirname, '..');
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
    }
  }
  walk(root);
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(source, /UPDATE\s+report_versions/i);
  assert.doesNotMatch(source, /DELETE\s+FROM\s+report_versions/i);
});

test('Part 3 restore delegates complete machine graph replacement and never locks physical event for mutation', () => {
  const restore = fs.readFileSync(path.join(__dirname, '../services/approvedReportEditService.js'), 'utf8');
  const fn = restore.slice(restore.indexOf('async function restoreApprovedReportVersion'));
  assert.match(fn, /replaceApprovedChildrenFromSnapshot/);
  assert.match(restore, /DELETE FROM production_report_machine_lines/);
  assert.match(restore, /INSERT INTO production_report_machine_lines/);
  assert.doesNotMatch(fn, /machine_production_events.*FOR UPDATE/i);
  assert.doesNotMatch(fn, /(?:UPDATE|DELETE FROM) machine_production_events/i);
});

test('parent snapshot contract includes F01 F03 F04 identity fields together', () => {
  const service = require('../services/approvedVersionSnapshotService');
  for (const field of ['standard_output','standard_version_id','machine_standard_id','training_percent_snapshot','exclude_kqd_from_tt_snapshot']) {
    assert.ok(service.REPORT_FIELDS.includes(field), field);
  }
});

test('machine line contract includes F01 F04 identity and F05 event link', () => {
  const service = require('../services/approvedVersionSnapshotService');
  for (const field of ['machine_event_id','standard_output','standard_version_id','machine_standard_id','exclude_kqd_from_tt','counted_output','machine_time_hours']) {
    assert.ok(service.MACHINE_LINE_FIELDS.includes(field), field);
  }
});

test('nested machine defects do not expose historical machine line database IDs', async () => {
  const snapshot = await loadApprovedAggregateSnapshot({ reportId: 9, executor: createExecutor(fixture()) });
  assert.equal(snapshot.machineLines[0].line.id, undefined);
  assert.equal(snapshot.machineLines[0].defects[0].machine_line_id, undefined);
});

test('snapshot query contracts explicitly order all child arrays deterministically', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/approvedVersionSnapshotService.js'), 'utf8');
  assert.match(source, /production_report_defects[\s\S]*ORDER BY defect_type_id ASC, id ASC/);
  assert.match(source, /production_report_deductions[\s\S]*ORDER BY deduction_type_id ASC, id ASC/);
  assert.match(source, /production_report_machine_lines[\s\S]*ORDER BY sort_order ASC, id ASC/);
  assert.match(source, /production_report_machine_defects[\s\S]*ORDER BY ml\.sort_order ASC, ml\.id ASC, md\.defect_code ASC/);
});

test('malformed JSON snapshot is rejected with stable validation code', () => {
  const result = validateApprovedVersionSnapshot('{broken');
  assert.equal(result.valid, false);
  assert.equal(result.issues[0].code, 'ROLLBACK_SNAPSHOT_INVALID');
});

test('machine line missing historical standard identity is not restore-safe', async () => {
  const snapshot = await loadApprovedAggregateSnapshot({ reportId: 9, executor: createExecutor(fixture()) });
  snapshot.machineLines[0].line.standard_version_id = null;
  const result = classifyApprovedVersionSnapshot(snapshot);
  assert.equal(result.restore_safe, 'REVIEW');
  assert.ok(result.reasons.includes('ROLLBACK_MISSING_STANDARD_SNAPSHOT'));
});

test('snapshot preserves F02 decimals on parent and machine line without integer coercion', async () => {
  const data = fixture({
    report: { standard_output: '1066.390000' },
    machineLines: [{ ...fixture().machineLines[0], standard_output: '309.760000', maximum_output: '2478.080000', counted_output: '900.770000' }]
  });
  const snapshot = await loadApprovedAggregateSnapshot({ reportId: 9, executor: createExecutor(data) });
  assert.equal(snapshot.report.standard_output, '1066.390000');
  assert.equal(snapshot.machineLines[0].line.standard_output, '309.760000');
  assert.equal(snapshot.machineLines[0].line.counted_output, '900.770000');
});

test('nullable machine_event_id is structurally valid for non-linked legacy/current participation', async () => {
  const data = fixture({ machineLines: [{ ...fixture().machineLines[0], machine_event_id: null }] });
  const snapshot = await loadApprovedAggregateSnapshot({ reportId: 9, executor: createExecutor(data) });
  const validation = validateApprovedVersionSnapshot(snapshot);
  assert.equal(validation.issues.some((x) => x.code === 'ROLLBACK_EVENT_LINK_UNKNOWN'), false);
});

test('approved version creator owns snapshot construction rather than accepting caller snapshot JSON', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/approvedVersionSnapshotService.js'), 'utf8');
  const start = source.indexOf('async function createApprovedReportVersion');
  const fn = source.slice(start, source.indexOf('\nmodule.exports', start));
  assert.match(fn, /loadApprovedAggregateSnapshot/);
  assert.doesNotMatch(fn, /snapshot\s*[:=]\s*options|snapshot\s*[:=]\s*arguments/);
});

test('initial approval no longer hand-builds approved report_versions payload', () => {
  const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
  assert.match(source, /createApprovedReportVersion/);
  assert.doesNotMatch(source, /versionReports, versionDefects, versionDeductions/);
});

test('Excel approved create captures machine graph through canonical loader after machine line inserts', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/approvedReportExcelCreateService.js'), 'utf8');
  const insertIndex = source.indexOf('INSERT INTO production_report_machine_lines');
  const versionIndex = source.indexOf('createApprovedReportVersion', insertIndex);
  assert.ok(insertIndex >= 0 && versionIndex > insertIndex);
  assert.match(source, /loadApprovedAggregateSnapshot/);
});

test('rollback scanner taxonomy contains every required legacy risk', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/approvedVersionSnapshotService.js'), 'utf8');
  for (const code of [
    'ROLLBACK_PARENT_ONLY_VERSION',
    'ROLLBACK_MISSING_STANDARD_SNAPSHOT',
    'ROLLBACK_MISSING_TRAINING_SNAPSHOT',
    'ROLLBACK_MISSING_KQD_POLICY',
    'ROLLBACK_EVENT_LINK_UNKNOWN',
    'ROLLBACK_CHILD_GRAPH_INCOMPLETE'
  ]) assert.match(source, new RegExp(code));
});
