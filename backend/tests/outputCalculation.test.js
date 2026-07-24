const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateActualOutput } = require('../utils/outputCalculation');

const defects = [
  { defect_code: 'KQD_DAP_LAI', quantity: 5 },
  { defect_code: 'VO_CAO_SU', quantity: 3 }
];

test('counts KQD when product rule allows it', () => {
  assert.equal(calculateActualOutput({ ttOk: 100, defects, excludeKqdFromTt: false }), 108);
});

test('excludes KQD when product rule disables it', () => {
  assert.equal(calculateActualOutput({ ttOk: 100, defects, excludeKqdFromTt: true }), 103);
});
