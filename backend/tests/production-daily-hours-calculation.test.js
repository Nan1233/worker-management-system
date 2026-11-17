'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { incomingDailyWorkHours } = require('../services/productionDailyHoursCalculation');

test('ordinary processes use report actual time', () => {
  assert.equal(incomingDailyWorkHours({ actual_time: 7.5 }, [], 'K1'), 7.5);
  assert.equal(incomingDailyWorkHours({ actual_time: 6 }, [], 'GC'), 6);
});

test('parallel machine processes use the maximum per-machine net hours', () => {
  const lines = [
    { machine_code: 'A', machine_time_hours: 3, deduction_time_hours: 1 },
    { machine_code: 'a', machine_time_hours: 2, deduction_time_hours: 0.5 },
    { machine_code: 'B', machine_time_hours: 6, deduction_time_hours: 1 }
  ];
  assert.equal(incomingDailyWorkHours({ actual_time: 8 }, lines, 'GC'), 5);
  assert.equal(incomingDailyWorkHours({ actual_time: 8 }, lines, 'MAI'), 5);
  assert.equal(incomingDailyWorkHours({ actual_time: 8 }, lines, 'K1'), 8);
});

test('negative machine net hours are clamped to zero', () => {
  const lines = [
    { machine_code: 'A', machine_time_hours: 1, deduction_time_hours: 3 },
    { machine_code: 'B', actual_time_hours: 2, deduction_time: 0.5 }
  ];
  assert.equal(incomingDailyWorkHours({}, lines, 'GC'), 1.5);
});
