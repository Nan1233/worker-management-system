'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { appendGiaCongMachineDeductions } = require('../services/giaCongMachineDeductionDetails');
const { buildGiaCongMachineAccounting } = require('../services/giaCongMachineAccounting');

test('GC machine deduction details merge repeated numeric type IDs', () => {
  const deductions = [];
  assert.strictEqual(appendGiaCongMachineDeductions(deductions, [
    { deduction_type_id: 12, deduction_code: 'BREAK', hours: 0.5 },
    { deduction_type_id: 12, deduction_code: 'BREAK', hours: 0.25 },
    { deduction_type_id: 13, deduction_code: 'SETUP', hours: 1 },
  ]), deductions);
  assert.deepEqual(deductions.map(x => [x.deduction_type_id, x.hours]), [[12, 0.75], [13, 1]]);
});

test('GC machine deduction details ignore nonpositive and invalid hours', () => {
  const deductions = [];
  appendGiaCongMachineDeductions(deductions, [
    { deduction_code: 'BREAK', hours: -1 },
    { deduction_code: 'BREAK', hours: 'bad' },
    { deduction_code: 'BREAK', hours: 0.5 },
  ]);
  assert.equal(deductions.length, 1);
  assert.equal(deductions[0].hours, 0.5);
});

test('GC accounting deduplicates shared physical event deduction details', () => {
  const line = { machine_event_id: 42, deductions_json: '[{"deduction_type_id":12,"deduction_code":"BREAK","hours":1}]' };
  const result = buildGiaCongMachineAccounting({ machineLines: [line, line] }, new Map([[42, { machine_time_hours: 8 }]]));
  assert.equal(result.deductionHours, 1);
  assert.equal(result.deductions.length, 1);
  assert.equal(result.deductions[0].hours, 1);
});
