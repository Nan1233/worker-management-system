'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateMachineLineDeductionHours } = require('../services/giaCongMachineDeductionHours');
const { buildGiaCongMachineAccounting } = require('../services/giaCongMachineAccounting');

test('GC machine deduction uses maximum of stored, minute, detail and legacy hours', () => {
  const line = { deduction_time_hours: 0.5, adjustment_minutes: 90 };
  const details = [{ hours: 0.75 }, { hours: 0.5 }];
  assert.equal(calculateMachineLineDeductionHours({ line, lineDeductions: details }), 1.5);
  assert.equal(calculateMachineLineDeductionHours({ line, lineDeductions: details, legacyMachineDeductionTime: 2 }), 2);
  assert.equal(calculateMachineLineDeductionHours({ line: {}, lineDeductions: [{ hours: -3 }, { hours: 'bad' }] }), 0);
});

test('GC shared physical event hours and deductions are counted once', () => {
  const result = buildGiaCongMachineAccounting({ machineLines: [
    { id: 1, machine_event_id: 7, deduction_time_hours: 0.5, adjustment_minutes: 90 },
    { id: 2, machine_event_id: 7, deduction_time_hours: 0.5, adjustment_minutes: 90 },
  ] }, new Map([[7, { machine_time_hours: 8 }]]));
  assert.equal(result.grossHours, 8);
  assert.equal(result.deductionHours, 1.5);
  assert.equal(result.netHours, 6.5);
});

test('GC worker deductions do not leak into physical machine accounting', () => {
  const result = buildGiaCongMachineAccounting({
    operation_mode: 'MACHINE',
    deduction_time: 5,
    deductions: [{ hours: 5 }],
    machineLines: [{ machine_time_hours: 8, deduction_time_hours: 0 }]
  }, new Map());
  assert.equal(result.deductionHours, 0);
  assert.equal(result.netHours, 8);
});
