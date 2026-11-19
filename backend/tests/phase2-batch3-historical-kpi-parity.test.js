'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const backend = require('../domain/productionCalculationEngine.cjs');
const desktop = require('../../desktop/electron/productionCalculationEngine.cjs');
const { buildGiaCongMachineAccounting } = require('../services/giaCongMachineAccounting');
const { getReportTrainingSnapshot, assertTrainingSnapshotAvailable } = require('../services/trainingSnapshotService');

const approved = Object.freeze({
  process_code: 'MAI',
  operation_mode: 'MANUAL',
  work_date: '2026-09-15',
  total_time: '7.000000',
  deduction_time: '1.000000',
  actual_time: '6.000000',
  actual_output: '100.000000',
  tt_ok: '90.000000',
  tt_ng: '10.000000',
  standard_output: '20.000000',
  standard_version_id: 17,
  training_percent_snapshot: '72.50',
  // This can change on the current employee profile; do NOT use for historical KPI.
  training_percent: 100,
  defects: [{ defect_type_id: 1, quantity: 10 }],
});

test('historical training snapshot dominates current training profile in both engines', () => {
  const originalBackend = backend.calculateProductionMetrics(approved);
  const originalDesktop = desktop.calculateProductionMetrics(approved);
  assert.equal(getReportTrainingSnapshot(approved), 72.5);
  assert.equal(assertTrainingSnapshotAvailable(approved), 72.5);
  for (const result of [originalBackend, originalDesktop]) {
    assert.equal(result.trainingPercent, 72.5);
    assert.equal(result.trainingFactor, 0.725);
    assert.equal(result.trainingSnapshotAvailable, true);
  }
  const currentProfileUpdated = { ...approved, training_percent: 5, current_standard_output: 9999 };
  for (const calculate of [backend.calculateProductionMetrics, desktop.calculateProductionMetrics]) {
    const before = calculate(approved);
    const after = calculate(currentProfileUpdated);
    for (const metric of ['trainingPercent','trainingFactor','actualTime','standard','plannedOutput','achievement','ngRate']) {
      assert.equal(after[metric], before[metric], `${metric} must be immutable across profile/current-standard updates`);
    }
  }
});

test('Backend and Desktop agree on persisted fields for a normal historical approved report', () => {
  const a = backend.calculateProductionMetrics(approved);
  const b = desktop.calculateProductionMetrics(approved);
  for (const metric of ['trainingPercent','trainingFactor','trainingSnapshotAvailable','actualTime','ok','allNg','countedNg','enteredOutput','standard','ngRate']) {
    assert.equal(a[metric], b[metric], metric);
  }
  assert.equal(a.actualTime, 6);
  assert.equal(b.actualTime, 6);
  assert.equal(approved.standard_output, '20.000000');
});

test('missing historical training snapshot fails closed in both metrics; no fallback to current profile', () => {
  const missing = { ...approved, training_percent_snapshot: null, training_percent: 95 };
  assert.throws(() => assertTrainingSnapshotAvailable(missing),
    error => error.code === 'TRAINING_SNAPSHOT_MISSING' && error.status === 422);
  for (const calculate of [backend.calculateProductionMetrics, desktop.calculateProductionMetrics]) {
    const metrics = calculate(missing);
    assert.equal(metrics.trainingSnapshotAvailable, false);
    assert.equal(metrics.trainingPercent, null);
    assert.equal(metrics.trainingFactor, null);
  }
});

test('physical machine time is counted once for two participants sharing one event', () => {
  const report = {
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 1, machine_event_id: 911, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' },
      { id: 2, machine_event_id: 911, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' },
    ],
  };
  const events = new Map([[911, { id: 911, machine_time_hours: 8 }]]);
  const accounting = buildGiaCongMachineAccounting(report, events);
  assert.equal(accounting.source, 'MACHINE_EVENT');
  assert.equal(accounting.grossHours, 8);
  assert.equal(accounting.netHours, 8);
});

test('an absent linked physical event cannot be replaced with participants’ hours', () => {
  const result = buildGiaCongMachineAccounting({
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 1, machine_event_id: 999, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' },
      { id: 2, machine_event_id: 999, machine_time_hours: 8, deduction_time_hours: 0, deductions_json: '[]' },
    ],
  }, new Map());
  assert.equal(result.source, 'MACHINE_EVENT_MISSING');
  assert.equal(result.grossHours, 0);
  assert.equal(result.netHours, 0);
});
