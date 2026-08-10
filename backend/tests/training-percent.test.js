const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTrainingPercent, trainingFactor } = require('../utils/trainingPercent');

test('training percent preserves zero and defaults only missing/invalid values', () => {
  assert.equal(normalizeTrainingPercent(undefined), 100);
  assert.equal(normalizeTrainingPercent(null), 100);
  assert.equal(normalizeTrainingPercent(''), 100);
  assert.equal(normalizeTrainingPercent('abc'), 100);
  assert.equal(normalizeTrainingPercent(0), 0);
  assert.equal(normalizeTrainingPercent('0'), 0);
  assert.equal(normalizeTrainingPercent(20), 20);
  assert.equal(normalizeTrainingPercent(50), 50);
  assert.equal(normalizeTrainingPercent(100), 100);
  assert.equal(trainingFactor(0), 0);
  assert.equal(trainingFactor(20), 0.2);
  assert.equal(trainingFactor(100), 1);
});
