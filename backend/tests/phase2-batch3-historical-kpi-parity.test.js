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

test('historical KPI remains unchanged after current standard, profile and machine metadata are edited', () => {
  const baseline = {
    ...approved,
    standard_output: '19.875000',
    standard_version_id: 118,
    training_percent_snapshot: '62.25',
    machine_standard_id: 44,
  };
  const mutatedCurrentMaster = {
    ...baseline,
    current_standard_output: '99999.000000',
    current_standard_version_id: 999,
    current_training_percent: 100,
    training_percent: 1,
    machine_standard_id_current: 777,
  };
  for (const calculate of [backend.calculateProductionMetrics, desktop.calculateProductionMetrics]) {
    const before = calculate(baseline);
    const after = calculate(mutatedCurrentMaster);
    for (const key of ['trainingPercent', 'trainingFactor', 'standard', 'actualTime', 'adjustedOutput', 'plannedOutput', 'outputPerHour', 'achievement', 'ngRate']) {
      assert.equal(after[key], before[key], key);
    }
    assert.equal(before.standard, 19.875);
    assert.equal(before.trainingPercent, 62.25);
  }
});

test('shared physical event time and deductions are counted once across two workers', () => {
  const report = {
    operation_mode: 'MACHINE',
    deduction_time: 5, // worker credits must never override machine deduction
    deductions: [{ hours: 5 }],
    machineLines: [
      { id: 1, machine_event_id: 911, machine_time_hours: 8, deduction_time_hours: 0.5, deductions_json: '[{"hours":0.5}]' },
      { id: 2, machine_event_id: 911, machine_time_hours: 8, deduction_time_hours: 0.5, deductions_json: '[{"hours":0.5}]' },
    ],
  };
  const result = buildGiaCongMachineAccounting(report, new Map([[911, { id: 911, machine_time_hours: 8 }]]));
  assert.equal(result.source, 'MACHINE_EVENT');
  assert.equal(result.grossHours, 8);
  assert.equal(result.deductionHours, 0.5);
  assert.equal(result.netHours, 7.5);
});

test('two different physical events count independently even if a participant line is duplicated', () => {
  const report = {
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 1, machine_event_id: 911, machine_time_hours: 8, deduction_time_hours: 0.5 },
      { id: 2, machine_event_id: 912, machine_time_hours: 6, deduction_time_hours: 1 },
      { id: 3, machine_event_id: 911, machine_time_hours: 8, deduction_time_hours: 0.5 },
    ],
  };
  const events = new Map([[911, { id: 911, machine_time_hours: 8 }], [912, { id: 912, machine_time_hours: 6 }]]);
  const result = buildGiaCongMachineAccounting(report, events);
  assert.equal(result.source, 'MACHINE_EVENT');
  assert.equal(result.grossHours, 14);
  assert.equal(result.deductionHours, 1.5);
  assert.equal(result.netHours, 12.5);
});

test('mixed present and missing physical events is explicitly partial and never substitutes worker hours', () => {
  const report = {
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 1, machine_event_id: 911, machine_time_hours: 8, deduction_time_hours: 0 },
      { id: 2, machine_event_id: 999, machine_time_hours: 99, deduction_time_hours: 0 },
    ],
  };
  const result = buildGiaCongMachineAccounting(report, new Map([[911, { id: 911, machine_time_hours: 8 }]]));
  assert.equal(result.source, 'MACHINE_EVENT_PARTIAL');
  assert.equal(result.grossHours, 8);
  assert.equal(result.netHours, 8);
});
