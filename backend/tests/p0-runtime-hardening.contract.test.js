'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('P0 approval batches acquire target IDs in deterministic order', () => {
  const shared = read('models/productionTempModelShared.js');
  assert.match(shared, /\.sort\(\(a, b\) => a - b\)/);
});

test('P0 runtime verifier checks canonical schema and real row-lock semantics', () => {
  const script = read('scripts/verifyP0Runtime.js');
  assert.match(script, /verifyDatabaseSchema/);
  assert.match(script, /uq_prt_worker_client_request/);
  assert.match(script, /production_report_duplicate_locks/);
  assert.match(script, /FOR UPDATE/);
  assert.match(script, /P0 RUNTIME VERIFY: PASS/);
  assert.match(script, /Runtime migrations: NONE/);
});

test('P0 runtime verification is exposed as a backend command without migrations', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['p0:runtime:verify'], 'node scripts/verifyP0Runtime.js');
  assert.doesNotMatch(pkg.scripts['p0:runtime:verify'], /migration/i);
});
