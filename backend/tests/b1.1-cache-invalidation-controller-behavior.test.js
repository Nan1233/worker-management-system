// B1.1 — NEW, additional test file (does NOT modify
// b1-standard-resolver-cache-invalidation.behavior.test.js). Purpose: close a
// disclosed coverage gap. The existing B1-D/D2/D3 tests only read
// adminMasterController.js / masterDataTransferController.js SOURCE TEXT and
// check string/indexOf() position (SOURCE REVIEW), never actually execute the
// controller functions. They cannot catch a runtime bug such as "invalidate
// gets called even though commit() threw" if the real control flow differs
// from what a textual position check implies.
//
// These tests actually REQUIRE and CALL
// adminMasterController.exports.update / exports.remove / exports.create
// against a mocked `../config/db` (injected via require.cache, so no real
// DB connection, no network, no env vars needed) and a spy replacing
// standardResolutionService.invalidateStandardResolutionCache, and assert on
// the spy's call count — this is a deliberate, disclosed exception to the
// project's general "test resolve() output, not spy calls" instruction,
// because the one thing B1-D/D2/D3 could NOT verify at the source-text level
// is exactly "was the real function called, under real async control flow,
// when commit() throws" and a spy is the correct tool for that question.
// Resolve-output-level coverage for cache staleness/invalidation itself is
// already provided by B1-A/B2/C/C2/E in the existing file; this file only
// adds controller-level call-timing coverage that was missing.
//
// AUTOMATED TEST (genuine behavior test, not source-text regex).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const STD_RES_PATH = require.resolve('../services/standardResolutionService');
const DB_PATH = require.resolve('../config/db');
const ADMIN_CTRL_PATH = require.resolve('../controllers/adminMasterController');

// 1) Load the REAL standardResolutionService (no DB needed at require time —
//    it only lazily requires config/db inside functions, never at top level,
//    confirmed by source review in B1.1 point 7). Replace its exported
//    invalidateStandardResolutionCache with a counting spy IN PLACE, on the
//    same exports object Node already cached — so any later `require()` of
//    this same resolved path (including adminMasterController's own
//    destructuring require) sees the spy, not the original function.
const standardResolutionService = require(STD_RES_PATH);
const originalInvalidate = standardResolutionService.invalidateStandardResolutionCache;
assert.equal(typeof originalInvalidate, 'function', 'sanity: real invalidateStandardResolutionCache must exist before patching');

let invalidateCallCount = 0;
standardResolutionService.invalidateStandardResolutionCache = function spyInvalidate(...args) {
  invalidateCallCount += 1;
  return originalInvalidate.apply(this, args);
};

// 2) Inject a fake `../config/db` module into require.cache BEFORE
//    adminMasterController.js is (re)required, so its top-level
//    `const db = require('../config/db');` binds to our fake object instead
//    of running the real mysql2 pool/env-var setup in config/db.js.
function makeFakeDb({ getConnectionImpl, topLevelQueryImpl }) {
  return {
    // top-level callback-style db.query(sql, params, cb) — used by
    // exports.create() for the plain INSERT.
    query(sql, params, cb) {
      try {
        const result = topLevelQueryImpl(sql, params);
        cb(null, result);
      } catch (error) {
        cb(error);
      }
    },
    promise() {
      return {
        getConnection: async () => getConnectionImpl(),
        // not used by create/update/remove directly, but keep the shape
        // consistent with the real db.promise() in case other code paths
        // touch it.
        query: async (sql, params) => topLevelQueryImpl(sql, params),
      };
    },
  };
}

function installFakeDb(fakeDb) {
  require.cache[DB_PATH] = {
    id: DB_PATH,
    filename: DB_PATH,
    loaded: true,
    exports: fakeDb,
    children: [],
    paths: [],
  };
}

function freshAdminMasterController() {
  delete require.cache[ADMIN_CTRL_PATH];
  return require(ADMIN_CTRL_PATH);
}

function makeMockConnection({ commitThrows = false } = {}) {
  const calls = { queries: [], beganTransaction: false, committed: false, rolledBack: false, released: false };
  const connection = {
    query: async (sql, params) => {
      calls.queries.push(sql);
      if (/^SELECT id, process_id FROM .* WHERE id=\? LIMIT 1$/.test(sql)) {
        return [[{ id: Number(params[0]), process_id: 1 }]];
      }
      if (/^SELECT machine_code FROM machines WHERE id=\? LIMIT 1$/.test(sql)) {
        return [[{ machine_code: 'C5' }]];
      }
      if (/^SELECT process_code FROM processes WHERE id=\? LIMIT 1$/.test(sql)) {
        return [[{ process_code: 'KHAC' }]];
      }
      if (/^UPDATE .* SET \? WHERE id=\?$/.test(sql)) {
        return [{ affectedRows: 1 }];
      }
      if (/^UPDATE .* SET status='inactive' WHERE id=\?$/.test(sql)) {
        return [{ affectedRows: 1 }];
      }
      throw new Error('Unexpected mock connection.query: ' + sql);
    },
    beginTransaction: async () => { calls.beganTransaction = true; },
    commit: async () => {
      calls.committed = true;
      if (commitThrows) throw new Error('SIMULATED_COMMIT_FAILURE');
    },
    rollback: async () => { calls.rolledBack = true; },
    release: () => { calls.released = true; },
  };
  return { connection, calls };
}

function makeMockRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return res;
}

function adminReq({ resource, id, body }) {
  return {
    params: { resource, id: String(id) },
    body,
    user: { id: 1, role: 'admin' }, // admin bypasses all process-scope DB queries (confirmed B1.1 point-5 review of processAuthorizationService.js)
  };
}

test.beforeEach(() => { invalidateCallCount = 0; });

test('B1.1-update-standards: exports.update() calls invalidateStandardResolutionCache() exactly once AFTER connection.commit() succeeds (genuine controller execution, mock DB)', async () => {
  const { connection, calls } = makeMockConnection({ commitThrows: false });
  const fakeDb = makeFakeDb({
    getConnectionImpl: () => connection,
    topLevelQueryImpl: () => { throw new Error('exports.update should not use top-level db.query'); },
  });
  installFakeDb(fakeDb);
  const adminMasterController = freshAdminMasterController();

  const req = adminReq({ resource: 'standards', id: 10, body: { standard_output: 150 } });
  const res = makeMockRes();
  let nextError = null;
  const next = (err) => { nextError = err; };

  await adminMasterController.update(req, res, next);

  assert.equal(nextError, null, 'update() should not call next(error) on success path: ' + (nextError && nextError.message));
  assert.equal(res.statusCode, null, 'success path uses res.json() without an explicit status(); got status ' + res.statusCode);
  assert.equal(res.body?.success, true, 'expected success:true response, got: ' + JSON.stringify(res.body));
  assert.equal(calls.committed, true, 'connection.commit() must have been called');
  assert.equal(calls.rolledBack, false, 'connection.rollback() must NOT have been called on the success path');
  assert.equal(invalidateCallCount, 1, 'invalidateStandardResolutionCache() must be called exactly once after a successful commit');
});

test('B1.1-update-standards-rollback: exports.update() must NOT call invalidateStandardResolutionCache() when connection.commit() throws ((rollback path)', async () => {
  const { connection, calls } = makeMockConnection({ commitThrows: true });
  const fakeDb = makeFakeDb({
    getConnectionImpl: () => connection,
    topLevelQueryImpl: () => { throw new Error('not used'); },
  });
  installFakeDb(fakeDb);
  const adminMasterController = freshAdminMasterController();

  const req = adminReq({ resource: 'standards', id: 10, body: { standard_output: 150 } });
  const res = makeMockRes();
  let nextError = null;
  const next = (err) => { nextError = err; };

  await adminMasterController.update(req, res, next);

  // exports.update()'s outer catch responds via res.status(...).json(...)
  // directly (it never reaches next() for this error shape), so assert on
  // that response instead of next().
  assert.equal(calls.committed, true, 'commit() was attempted (and threw)');
  assert.equal(calls.rolledBack, true, 'connection.rollback() must have been called after commit() threw');
  assert.equal(invalidateCallCount, 0, 'invalidateStandardResolutionCache() must NOT be called when commit() throws -- this is the exact scenario B1-D (source-text check) could not execute at runtime');
  assert.notEqual(res.body?.success, true, 'response must not report success when commit() threw; got: ' + JSON.stringify(res.body));
});

test('B1.1-remove-standards: exports.remove() calls invalidateStandardResolutionCache() exactly once AFTER commit() succeeds', async () => {
  const { connection, calls } = makeMockConnection({ commitThrows: false });
  const fakeDb = makeFakeDb({
    getConnectionImpl: () => connection,
    topLevelQueryImpl: () => { throw new Error('not used'); },
  });
  installFakeDb(fakeDb);
  const adminMasterController = freshAdminMasterController();

  const req = adminReq({ resource: 'standards', id: 10 });
  const res = makeMockRes();
  let nextError = null;
  const next = (err) => { nextError = err; };

  await adminMasterController.remove(req, res, next);

  assert.equal(nextError, null, 'remove() should not call next(error) on success path: ' + (nextError && nextError.message));
  assert.equal(res.body?.success, true, 'expected success:true response, got: ' + JSON.stringify(res.body));
  assert.equal(calls.committed, true);
  assert.equal(calls.rolledBack, false);
  assert.equal(invalidateCallCount, 1, 'invalidateStandardResolutionCache() must be called exactly once after remove() commits');
});

test('B1.1-remove-standards-rollback: exports.remove() must NOT call invalidateStandardResolutionCache() when connection.commit() throws', async () => {
  const { connection, calls } = makeMockConnection({ commitThrows: true });
  const fakeDb = makeFakeDb({
    getConnectionImpl: () => connection,
    topLevelQueryImpl: () => { throw new Error('not used'); },
  });
  installFakeDb(fakeDb);
  const adminMasterController = freshAdminMasterController();

  const req = adminReq({ resource: 'standards', id: 10 });
  const res = makeMockRes();
  let nextError = null;
  const next = (err) => { nextError = err; };

  await adminMasterController.remove(req, res, next);

  // Correction made during this B1.1 review run (caught by actually executing
  // the controller, not by a source-text guess): exports.remove()'s OUTER
  // catch is `catch(error){next(error);}` -- unlike exports.update(), which
  // responds via res.status(...).json(...) in its outer catch. So on a
  // commit() failure, remove() propagates the error through next(), and
  // res.json() is never called at all.
  assert.notEqual(nextError, null, 'remove() routes a thrown error through next(error) in its outer catch');
  assert.equal(nextError?.message, 'SIMULATED_COMMIT_FAILURE');
  assert.equal(calls.committed, true, 'commit() was attempted (and threw)');
  assert.equal(calls.rolledBack, true, 'rollback() must have been called');
  assert.equal(invalidateCallCount, 0, 'invalidateStandardResolutionCache() must NOT be called when commit() throws');
  assert.equal(res.body, null, 'res.json() must never be called on this path; remove() reports the error via next()');
});

test('B1.1-create-standards: exports.create() (callback-style db.query) calls invalidateStandardResolutionCache() exactly once on genuine INSERT success', async () => {
  const fakeDb = makeFakeDb({
    getConnectionImpl: () => { throw new Error('exports.create for standards should not need getConnection()'); },
    topLevelQueryImpl: (sql) => {
      if (/^INSERT INTO product_standards SET \?$/.test(sql)) return { insertId: 777 };
      throw new Error('Unexpected top-level db.query: ' + sql);
    },
  });
  installFakeDb(fakeDb);
  const adminMasterController = freshAdminMasterController();

  const req = adminReq({ resource: 'standards', body: { process_id: 1, product_code: 'P1', standard_output: 100 } });
  const res = makeMockRes();
  let nextError = null;
  const next = (err) => { nextError = err; };

  await adminMasterController.create(req, res, next);

  assert.equal(nextError, null, 'create() should not call next(error) on success: ' + (nextError && nextError.message));
  assert.equal(res.statusCode, 201, 'expected 201 Created, got ' + res.statusCode + ' body=' + JSON.stringify(res.body));
  assert.equal(res.body?.success, true);
  assert.equal(invalidateCallCount, 1, 'invalidateStandardResolutionCache() must be called exactly once after a successful INSERT');
});

test('B1.1-create-standards-error: exports.create() must NOT call invalidateStandardResolutionCache() when the INSERT callback reports an error', async () => {
  const fakeDb = makeFakeDb({
    getConnectionImpl: () => { throw new Error('not used'); },
    topLevelQueryImpl: (sql) => {
      if (/^INSERT INTO product_standards SET \?$/.test(sql)) {
        const error = new Error('SIMULATED_INSERT_FAILURE');
        error.code = 'ER_LOCK_WAIT_TIMEOUT';
        throw error;
      }
      throw new Error('Unexpected top-level db.query: ' + sql);
    },
  });
  installFakeDb(fakeDb);
  const adminMasterController = freshAdminMasterController();

  const req = adminReq({ resource: 'standards', body: { process_id: 1, product_code: 'P1', standard_output: 100 } });
  const res = makeMockRes();
  let nextError = null;
  const next = (err) => { nextError = err; };

  await adminMasterController.create(req, res, next);

  assert.notEqual(nextError, null, 'create() routes a non-duplicate-key INSERT error through next(error)');
  assert.equal(invalidateCallCount, 0, 'invalidateStandardResolutionCache() must NOT be called when the INSERT callback reports an error');
});

test.after(() => {
  // Restore the real invalidateStandardResolutionCache on the shared module
  // exports object, and drop the injected fake db.js / reloaded
  // adminMasterController cache entries, so this file leaves no global
  // state behind for any other test file run in the same process (node:test
  // normally isolates files into separate worker processes, but this keeps
  // the file self-contained regardless of runner configuration).
  standardResolutionService.invalidateStandardResolutionCache = originalInvalidate;
  delete require.cache[DB_PATH];
  delete require.cache[ADMIN_CTRL_PATH];
});
