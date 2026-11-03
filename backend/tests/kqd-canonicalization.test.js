const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateProductionOutput } = require('../../shared/kqdPolicy.cjs');
const { recalculateReportOutput } = require('../services/kqdReportCalculationService');
const { calculateProductionMetrics } = require('../domain/productionCalculationEngine.cjs');

const defects = [
  { defect_code: 'BAVIA', quantity: 6 },
  { defect_code: 'KQD', quantity: 4 }
];

test('KQD is counted as an ordinary NG defect in production output', () => {
  const result = calculateProductionOutput({ ok: 90, defects });
  assert.equal(result.totalNg, 10);
  assert.equal(result.countedNg, 10);
  assert.equal(result.excludedKqd, 0);
  assert.equal(result.actualOutput, 100);
});

test('legacy exclusion flags cannot change output calculation', () => {
  const enabled = calculateProductionOutput({ ok: 90, defects, excludeKqdFromTt: true });
  const disabled = calculateProductionOutput({ ok: 90, defects, excludeKqdFromTt: false });
  assert.equal(enabled.actualOutput, 100);
  assert.equal(disabled.actualOutput, 100);
  assert.equal(enabled.countedNg, 10);
});

test('temp and approved edit recalculation counts all NG and preserves OK', () => {
  const result = recalculateReportOutput({ ttOk: 90, defects, excludeKqdFromTtSnapshot: 1 });
  assert.equal(result.actualOutput, 100);
  assert.equal(result.ttOk, 90);
  assert.equal(result.totalNg, 10);
});

test('production metrics ignore legacy KQD policy snapshots', () => {
  const metrics = calculateProductionMetrics({
    tt_ok: 90, tt_ng: 10, actual_output: 100, actual_time: 1, total_time: 1,
    deduction_time: 0, standard_output: 100, training_percent_snapshot: 100,
    exclude_kqd_from_tt_snapshot: 1, exclude_kqd_from_tt: 1, defects
  }, { output_formula: 'OK_PLUS_NG', apply_training_percent: 0 });
  assert.equal(metrics.countedNg, 10);
  assert.equal(metrics.excludedKqd, 0);
  assert.equal(metrics.enteredOutput, 100);
});

test('KQD remains a named defect category, not an output policy', () => {
  const kqd = defects.find((item) => item.defect_code === 'KQD');
  assert.ok(kqd);
  assert.equal(kqd.quantity, 4);
});
