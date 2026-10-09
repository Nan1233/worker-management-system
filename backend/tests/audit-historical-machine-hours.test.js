'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyReport } = require('../scripts/auditHistoricalMachineHours.cjs');

const report = {
  id: 101,
  work_date: '2026-09-01',
  worker_code: 'GC-TEST',
  shift: 'A',
  operation_mode: 'MACHINE',
  total_time: 8,
  deduction_time: 1
};

test('historical audit marks a valid single machine with missing time as eligible', () => {
  const result = classifyReport(report, [{
    id: 1, machine_code: '5', machine_time_hours: 0, deduction_time_hours: 0
  }]);
  assert.equal(result.action, 'ELIGIBLE_SINGLE_MACHINE');
  assert.equal(result.worker_total_hours, 8);
  assert.equal(result.worker_deduction_hours, 1);
});

test('historical audit never auto-qualifies a report with multiple machines and missing time', () => {
  const result = classifyReport(report, [
    { id: 1, machine_code: '5', machine_time_hours: 0, deduction_time_hours: 0 },
    { id: 2, machine_code: '6', machine_time_hours: 0, deduction_time_hours: 0 }
  ]);
  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'MULTI_MACHINE_ALLOCATION_REQUIRES_CONFIRMATION');
});

test('historical audit flags a machine already exceeding 12 hours without changing it', () => {
  const result = classifyReport(report, [{
    id: 1, machine_code: '5', machine_time_hours: 14, deduction_time_hours: 0
  }]);
  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'EXISTING_MACHINE_TIME_OVER_12_HOURS');
  assert.equal(result.machine_lines[0].machine_time_hours, 14);
});

test('historical audit flags worker-level time above 12 hours for reconciliation', () => {
  const result = classifyReport({ ...report, total_time: 13 }, [{
    id: 1, machine_code: '5', machine_time_hours: 0, deduction_time_hours: 0
  }]);
  assert.equal(result.action, 'REVIEW');
  assert.equal(result.reason, 'WORKER_TIME_OR_DEDUCTION_OVER_12_HOURS');
});

test('historical audit leaves reports without machine lines on worker-time flow', () => {
  const result = classifyReport(report, []);
  assert.equal(result.action, 'NO_CHANGE');
  assert.equal(result.reason, 'NO_MACHINE_LINES_USE_WORKER_TIME');
});
