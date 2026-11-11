'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateProductionMetrics } = require('../domain/productionCalculationEngine.cjs');

test('worker production rates retain training adjustment and standard achievement', () => {
  const metrics = calculateProductionMetrics({ actual_output: 200, tt_ok: 190, tt_ng: 10,
    actual_time: 2, standard_output: 100, training_percent: 50 });
  assert.equal(metrics.adjustedOutput, 100);
  assert.equal(metrics.plannedOutput, 100);
  assert.equal(metrics.outputPerHour, 50);
  assert.equal(metrics.achievement, 0.5);
});

test('entered output formula changes SP/h numerator without changing adjusted output', () => {
  const metrics = calculateProductionMetrics({ actual_output: 200, tt_ok: 190, tt_ng: 10,
    actual_time: 2, standard_output: 100, training_percent: 50 },
  { output_per_hour_formula: 'ENTERED_OUTPUT_DIV_ACTUAL_TIME' });
  assert.equal(metrics.adjustedOutput, 100);
  assert.equal(metrics.outputPerHour, 100);
  assert.equal(metrics.achievement, 1);
});

test('shared-machine aggregate snapshot overrides worker training output and planned output', () => {
  const metrics = calculateProductionMetrics({ actual_output: 999, actual_time: 2.5,
    standard_output: 100, training_percent: 50,
    machinePerformance: { machine_count: 2, counted_output: 230, maximum_output: 250 } });
  assert.equal(metrics.adjustedOutput, 230);
  assert.equal(metrics.plannedOutput, 250);
  assert.equal(metrics.outputPerHour, 92);
  assert.equal(metrics.achievement, 0.92);
});

test('zero actual time never divides by zero', () => {
  const metrics = calculateProductionMetrics({ actual_output: 100, actual_time: 0,
    standard_output: 100, training_percent: 100 });
  assert.equal(metrics.outputPerHour, null);
  assert.equal(metrics.achievement, null);
});
