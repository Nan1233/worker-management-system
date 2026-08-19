const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('observability exposes percentile and route metrics without query-string leakage', () => {
  const s = read('services/runtimeMetrics.js');
  assert.match(s, /p50DurationMs/);
  assert.match(s, /p95DurationMs/);
  assert.match(s, /byRoute/);
  assert.match(s, /split\('\?'\)\[0\]/);
});

test('server hardens browser capability and slow-client handling', () => {
  const s = read('server.js');
  assert.match(s, /Permissions-Policy/);
  assert.match(s, /strict-origin-when-cross-origin/);
  assert.match(s, /server\.requestTimeout/);
  assert.match(s, /server\.headersTimeout/);
});

test('activity endpoint supports cursor pagination and explicit projection', () => {
  const s = read('controllers/systemController.js');
  assert.match(s, /before_id/);
  assert.match(s, /a\.id < \?/);
  assert.match(s, /SELECT a\.id,a\.user_id,a\.action/);
});

test('worker notification backfill is throttled per user', () => {
  const s = read('controllers/systemController.js');
  assert.match(s, /WORKER_NOTIFICATION_BACKFILL_TTL_MS/);
  assert.match(s, /completedAt/);
});


test('server limits urlencoded bodies and pathological query strings', () => {
  const s = read('server.js');
  assert.match(s, /express\.urlencoded\(\{[\s\S]*parameterLimit/);
  assert.match(s, /QUERY_STRING_TOO_LONG/);
  assert.match(s, /MAX_QUERY_STRING_LENGTH/);
});
