'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('async function rollbackReviewTransaction(');
const end = source.indexOf('function createReviewTransitionConflictError(', start);
assert.ok(start >= 0 && end > start, 'review rollback helper must exist');

function setup(rollback) {
  const logs = [];
  const context = { rollback, console: { error: (...args) => logs.push(args.join(' ')) } };
  vm.runInNewContext(source.slice(start, end), context);
  return { run: vm.runInNewContext('rollbackReviewTransaction', context), logs };
}

test('successful rollback preserves the original review error', async () => {
  const original = new Error('review conflict');
  const connection = { id: 'tx' };
  let passed;
  const { run, logs } = setup(async (conn) => { passed = conn; return { ok: true }; });
  await run(connection, original);
  assert.strictEqual(passed, connection);
  assert.equal(original.message, 'review conflict');
  assert.equal(original.rollbackError, undefined);
  assert.equal(logs.length, 0);
});

test('rollback result failure attaches diagnostics without replacing original error', async () => {
  const original = new Error('approval failed');
  const rollbackError = new Error('rollback refused');
  const { run, logs } = setup(async () => ({ ok: false, error: rollbackError }));
  await run({}, original);
  assert.strictEqual(original.rollbackError, rollbackError);
  assert.equal(original.message, 'approval failed');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /APPROVAL_ROLLBACK_FAILED.*rollback refused/);
});

test('thrown rollback failure attaches diagnostics without masking original error', async () => {
  const original = new Error('stale version');
  const rollbackError = new Error('network failure');
  const { run, logs } = setup(async () => { throw rollbackError; });
  await run({}, original);
  assert.strictEqual(original.rollbackError, rollbackError);
  assert.equal(original.message, 'stale version');
  assert.equal(logs.length, 1);
  assert.match(logs[0], /APPROVAL_ROLLBACK_FAILED.*network failure/);
});
