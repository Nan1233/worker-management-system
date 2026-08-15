'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  normalizeWorkerCode,
  loadCanonicalTrainingMap,
  matchCanonicalWorkers
} = require('../scripts/backfillTrainingSnapshotsFromCanonicalData');

test('canonical KTC data exposes valid training percent for every canonical worker', () => {
  const source = path.resolve(__dirname, '../data/mau-goc-ktc.json');
  const canonical = loadCanonicalTrainingMap(source);
  assert.equal(canonical.byCode.size, 596);
  for (const item of canonical.byCode.values()) {
    assert.ok(Number.isFinite(Number(item.training_percent)));
    assert.ok(Number(item.training_percent) >= 0);
    assert.ok(Number(item.training_percent) <= 100);
  }
});

test('canonical backfill matches worker_code and preserves source training percent', () => {
  const canonical = {
    byCode: new Map([
      [normalizeWorkerCode('599'), { worker_code: '599', training_percent: 80, full_name: 'A' }],
      [normalizeWorkerCode(' NV01 '), { worker_code: 'NV01', training_percent: 100, full_name: 'B' }]
    ])
  };
  const result = matchCanonicalWorkers([
    { id: 10, worker_code: '599', training_percent: 100 },
    { id: 11, worker_code: 'nv01', training_percent: 90 },
    { id: 12, worker_code: 'UNKNOWN', training_percent: 100 }
  ], canonical);

  assert.deepEqual(result.matched.map((x) => [x.worker_id, x.training_percent]), [[10, 80], [11, 100]]);
  assert.equal(result.missingInCanonical.length, 1);
  assert.equal(result.missingInDb.length, 0);
});
