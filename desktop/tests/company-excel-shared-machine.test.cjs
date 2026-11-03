'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { _private } = require('../electron/companyExcelLocal.cjs');

test('legacy company GC rows use worker participation and deduction snapshots', () => {
  const metrics = _private.getMetrics({
    process_code: 'GC',
    operation_mode: 'MACHINE',
    total_time: 4,
    actual_time: 3.5,
    deduction_time: 0.5,
    tt_ok: 100,
    tt_ng: 2,
    actual_output: 102,
    standard_output: 25,
    training_percent: 100,
    deductions: [{ deduction_type_id: 4, deduction_name: 'Chỉnh máy', hours: 0.5 }],
    machineLines: [
      { machine_event_id: 900, machine_time_hours: 2 },
      { machine_event_id: 900, machine_time_hours: 2 }
    ],
    eventLines: [{ id: 900, machine_time_hours: 6 }],
    machineAccounting: {
      grossHours: 6,
      deductionHours: 1,
      netHours: 5,
      deductions: [{ deduction_type_id: 8, deduction_name: 'Dừng máy', hours: 1 }]
    }
  });

  assert.equal(metrics.totalTime, 4);
  assert.equal(metrics.actualTime, 3.5);
  assert.equal(metrics.deductionTotal, 0.5);
  assert.equal(metrics.outputPerHour, 102 / 3.5);
});

test('legacy company GC rows fall back to summed worker participation lines only when report total is absent', () => {
  const metrics = _private.getMetrics({
    process_code: 'GC',
    operation_mode: 'MACHINE',
    actual_time: null,
    deduction_time: 0.25,
    machineLines: [
      { machine_event_id: 901, machine_time_hours: 1.5 },
      { machine_event_id: 901, machine_time_hours: 2 }
    ],
    eventLines: [{ id: 901, machine_time_hours: 6 }]
  });

  assert.equal(metrics.totalTime, 3.5);
  assert.equal(metrics.actualTime, 3.25);
  assert.equal(metrics.deductionTotal, 0.25);
});
