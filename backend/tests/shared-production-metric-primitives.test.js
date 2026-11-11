'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const shared = require('../../shared/productionMetricPrimitives.cjs');
const backend = require('../domain/productionCalculationEngine.cjs');
const desktop = require('../../desktop/electron/productionCalculationEngine.cjs');

test('backend and Desktop export the same shared production metric primitives', () => {
  for (const name of [
    'DEFAULT_SETTINGS', 'asNumber', 'asInteger',
    'normalizeTrainingPercent', 'trainingFactor'
  ]) {
    assert.strictEqual(backend[name], shared[name], `backend.${name}`);
    assert.strictEqual(desktop[name], shared[name], `desktop.${name}`);
  }
});

test('numeric conversions retain legacy null and comma semantics', () => {
  assert.equal(shared.asNumber('1,234.5'), 1234.5);
  assert.equal(shared.asInteger('1,234.5'), 1235);
  assert.equal(shared.asNumber(''), null);
  assert.equal(shared.asNumber('invalid'), null);
  assert.equal(shared.asInteger(null), null);
});

test('training snapshots retain clamping and blank default behavior', () => {
  assert.equal(shared.normalizeTrainingPercent(''), 100);
  assert.equal(shared.normalizeTrainingPercent(null), 100);
  assert.equal(shared.normalizeTrainingPercent(125), 100);
  assert.equal(shared.normalizeTrainingPercent(-5), 0);
  assert.equal(shared.trainingFactor(65.5), 0.655);
});

test('metric settings are shared but backend and Desktop calculation engines remain distinct', () => {
  assert.equal(shared.DEFAULT_SETTINGS.actual_time_formula, 'DATABASE_SNAPSHOT');
  assert.equal(backend.calculateProductionMetrics === desktop.calculateProductionMetrics, false);
  assert.ok(Object.isFrozen(shared.DEFAULT_SETTINGS));
});
