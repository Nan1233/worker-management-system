'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { _private: { reportSnapshot } } = require('../electron/monthlyWorkbookLocal.cjs');

function fixture(overrides = {}) {
  return {
    process_code: 'MAI',
    worker_code: '4333',
    total_time: 10.6667,
    actual_time: 10.6667,
    deduction_time: 0,
    deductions: [
      { deduction_type_code: 'NGHI_GIAI_LAO', hours: 1.1666666666666667 },
      { deduction_type_code: '5S', hours: 0.16666666666666666 }
    ],
    ...overrides
  };
}

test('MAI: Excel total equals recorded detail when approved deduction total is zero', () => {
  const report = fixture();
  const snapshot = reportSnapshot(report);
  assert.ok(Math.abs(snapshot.deductionTime - (4 / 3)) < 1e-9);
  assert.equal(report.deduction_time, 0, 'never mutate approved report data');
  assert.equal(snapshot.actualTime, 10.6667, 'preserve approved actual_time snapshot');
});

test('MAI: nonzero approved total is not overwritten by deduction details', () => {
  const snapshot = reportSnapshot(fixture({ deduction_time: 1.5 }));
  assert.equal(snapshot.deductionTime, 1.5);
});

test('MAI: absent details cannot create a false deduction total', () => {
  const snapshot = reportSnapshot(fixture({ deductions: [] }));
  assert.equal(snapshot.deductionTime, 0);
});

test('GC MACHINE: preserve per-machine accounting, not parent detail fallback', () => {
  const snapshot = reportSnapshot(fixture({
    process_code: 'GC',
    operation_mode: 'MACHINE',
    calculationSnapshot: {
      trainingFactor: 1, standard: 10, workingTime: 8, actualTime: 7,
      deductionTime: 0, ok: 30, allNg: 0, countedNg: 0,
      enteredOutput: 30, adjustedOutput: 30, outputPerHour: 30 / 7,
      achievement: 0.4, ngRate: 0
    }
  }));
  assert.equal(snapshot.deductionTime, 0);
});
