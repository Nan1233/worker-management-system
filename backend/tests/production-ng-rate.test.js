'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateProductionNgRate } = require('../domain/productionNgRate.cjs');
const { calculateProductionMetrics } = require('../domain/productionCalculationEngine.cjs');

test('NG rate denominator uses OK + all NG by default, including KQD', () => {
  assert.equal(calculateProductionNgRate({ formula: 'NG_DIV_OK_PLUS_NG', enteredOutput: 500, ok: 90, allNg: 10 }), 0.1);
  const metrics = calculateProductionMetrics({ tt_ok: 90, tt_ng: 10, actual_output: 500,
    defects: [{ defect_type_code: 'KQD', quantity: 4 }, { defect_type_code: 'OTHER', quantity: 6 }] });
  assert.equal(metrics.ngRate, 0.1);
});

test('NG rate can use entered output and safely handles zero denominator', () => {
  assert.equal(calculateProductionNgRate({ formula: 'NG_DIV_ENTERED_OUTPUT', enteredOutput: 500, ok: 90, allNg: 10 }), 0.02);
  assert.equal(calculateProductionNgRate({ formula: 'NG_DIV_ENTERED_OUTPUT', enteredOutput: 0, ok: 90, allNg: 10 }), null);
  assert.equal(calculateProductionNgRate({ formula: 'NG_DIV_OK_PLUS_NG', enteredOutput: 10, ok: 0, allNg: 0 }), null);
  assert.equal(calculateProductionNgRate({ formula: 'NG_DIV_OK_PLUS_NG', enteredOutput: 10, ok: null, allNg: 10 }), null);
});
