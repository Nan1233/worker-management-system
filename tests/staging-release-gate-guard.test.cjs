'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('staging release gate routes write-path E2E through database guard', () => {
  const gate = fs.readFileSync(path.join(root, 'scripts/stagingReleaseGate.cjs'), 'utf8');
  const e2e = fs.readFileSync(path.join(root, 'scripts/stagingE2E.cjs'), 'utf8');
  assert.match(gate, /scripts\/stagingE2E\.cjs/);
  assert.doesNotMatch(gate, /scripts\/zero-cost\/critical-e2e\.cjs/);
  assert.match(e2e, /e2e-db-guard\.cjs/);
  assert.match(e2e, /critical-e2e\.cjs/);
});
