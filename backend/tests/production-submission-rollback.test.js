'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rollbackOrThrow } = require('../services/productionSubmissionRollback');

test('successful rollback preserves original error and does not emit rollback failure', async () => {
  const original = Object.assign(new Error('original SQL error'), { code: 'ER_LOCK_DEADLOCK' });
  const messages = [];
  const connection = {};
  const result = await rollbackOrThrow(connection, original,
    async (actual) => { assert.strictEqual(actual, connection); return { ok: true }; },
    { error: (...args) => messages.push(args) });
  assert.deepEqual(result, { ok: true });
  assert.equal(original.rollbackFailed, undefined);
  assert.equal(messages.length, 0);
});

test('failed rollback attaches diagnostics but does not overwrite the SQL error', async () => {
  const original = Object.assign(new Error('SQL error'), { code: 'ER_DUP_ENTRY', errno: 1062 });
  const rollbackError = Object.assign(new Error('rollback connection lost'), { code: 'ECONNRESET' });
  const logs = [];
  const result = await rollbackOrThrow({}, original,
    async () => ({ ok: false, error: rollbackError }),
    { error: (...args) => logs.push(args) });
  assert.equal(result.ok, false);
  assert.equal(original.message, 'SQL error');
  assert.equal(original.code, 'ER_DUP_ENTRY');
  assert.equal(original.rollbackFailed, true);
  assert.strictEqual(original.rollbackError, rollbackError);
  assert.equal(logs.length, 1);
  assert.match(logs[0][0], /transaction rollback failed/);
  const diagnostic = JSON.parse(logs[0][1]);
  assert.equal(diagnostic.originalError.code, 'ER_DUP_ENTRY');
  assert.equal(diagnostic.rollbackError.code, 'ECONNRESET');
});

test('failed rollback without original error still emits diagnostic', async () => {
  const logs = [];
  const rollbackError = new Error('rollback failed');
  const result = await rollbackOrThrow({}, null,
    async () => ({ ok: false, error: rollbackError }),
    { error: (...args) => logs.push(args) });
  assert.equal(result.ok, false);
  assert.equal(JSON.parse(logs[0][1]).originalError, null);
});
