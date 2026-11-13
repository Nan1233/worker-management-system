'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Evaluate only the identity resolver against an isolated DB stub: no live DB,
// token signing keys or production data are required.
const source = fs.readFileSync(path.join(__dirname, '../middleware/authMiddleware.js'), 'utf8');
const start = source.indexOf('async function loadCurrentUser(decoded) {');
const end = source.indexOf('\nmodule.exports =', start);
assert.ok(start >= 0 && end > start, 'identity resolver must be present');
async function resolve(decoded, query) {
  const context = { db: { promise: () => ({ query }) } };
  vm.runInNewContext(source.slice(start, end), context);
  return context.loadCurrentUser(decoded);
}

test('deleted token user ID cannot fall back to a matching username or worker ID', async () => {
  const queries = [];
  const user = await resolve({ id: 701, username: 'reassigned', worker_id: 88 }, async (sql, params) => {
    queries.push({ sql, params });
    return [[]];
  });
  assert.equal(user, null);
  assert.equal(queries.length, 1, 'must not query another identity after ID lookup misses');
  assert.match(queries[0].sql, /WHERE u\.id=\?/);
  assert.equal(queries[0].params[0], 701);
});

test('existing token user ID resolves only its exact database account', async () => {
  const user = await resolve({ id: 702, username: 'oldname' }, async (sql, params) => {
    assert.match(sql, /WHERE u\.id=\?/);
    assert.equal(params[0], 702);
    return [[{ id: 702, username: 'newname', role: 'worker', status: 'active' }]];
  });
  assert.equal(user.id, 702);
  assert.equal(user.username, 'newname');
});
