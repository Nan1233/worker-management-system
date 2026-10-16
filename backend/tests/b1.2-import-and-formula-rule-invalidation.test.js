// B1.2 — NEW test file. Closes the two remaining coverage gaps identified in
// B1.1 point 8 / B1.2 step 1: masterDataTransferController.js::import and
// formulaSettingsController.js::updateProductRule previously only had
// SOURCE-TEXT review for their invalidate-timing, never a genuine behavior
// test that actually executes them.
//
// AUTOMATED TEST (genuine behavior test): calls the real exported controller
// functions against a mocked `../config/db` (injected via require.cache,
// same technique as b1.1-cache-invalidation-controller-behavior.test.js) and
// a spy on standardResolutionService.invalidateStandardResolutionCache.
// No real DB connection, no network. The import() tests build a REAL,
// in-memory .xlsx workbook with ExcelJS (already a backend dependency used
// by the controller itself) so the Excel-parsing code path is genuinely
// exercised, not stubbed out.
//
// Does NOT modify any existing test file.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const STD_RES_PATH = require.resolve('../services/standardResolutionService');
const DB_PATH = require.resolve('../config/db');
const TRANSFER_CTRL_PATH = require.resolve('../controllers/masterDataTransferController');
const FORMULA_CTRL_PATH = require.resolve('../controllers/formulaSettingsController');

const standardResolutionService = require(STD_RES_PATH);
const originalInvalidate = standardResolutionService.invalidateStandardResolutionCache;
assert.equal(typeof originalInvalidate, 'function', 'sanity: real invalidateStandardResolutionCache must exist before patching');

let invalidateCallCount = 0;
standardResolutionService.invalidateStandardResolutionCache = function spyInvalidate(...args) {
  invalidateCallCount += 1;
  return originalInvalidate.apply(this, args);
};

function makeFakeDb({ getConnectionImpl, topLevelPromiseQueryImpl }) {
  return {
    promise() {
      return {
        getConnection: async () => getConnectionImpl(),
        query: async (sql, params) => topLevelPromiseQueryImpl(sql, params),
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

function freshModule(resolvedPath) {
  delete require.cache[resolvedPath];
  return require(resolvedPath);
}

function makeMockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function adminReq({ params = {}, body = {} } = {}) {
  return { params, body, user: { id: 1, role: 'admin' } }; // admin bypasses all process-scope DB queries
}

async function buildStandardsXlsxBase64(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('SanPhamDinhMuc');
  const columns = ['process_id', 'product_code', 'standard_output', 'exclude_kqd_from_tt', 'status'];
  sheet.columns = columns.map((key) => ({ header: key, key }));
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}

// --- A) masterDataTransferController.js::import ---------------------------

function makeMockImportConnection({ failOnQueryMatching = null, commitThrows = false } = {}) {
  const calls = { queries: [], committed: false, rolledBack: false, released: false };
  const connection = {
    query: async (sql, params) => {
      calls.queries.push(sql);
      if (failOnQueryMatching && failOnQueryMatching.test(sql)) {
        throw new Error('SIMULATED_ROW_WRITE_FAILURE');
      }
      if (/^INSERT INTO product_standards SET \?$/.test(sql)) return [{ insertId: 501 }];
      if (/^INSERT INTO machines SET \?$/.test(sql)) return [{ insertId: 502 }];
      throw new Error('Unexpected mock import connection.query: ' + sql);
    },
    beginTransaction: async () => {},
    commit: async () => {
      calls.committed = true;
      if (commitThrows) throw new Error('SIMULATED_COMMIT_FAILURE');
    },
    rollback: async () => { calls.rolledBack = true; },
    release: () => { calls.released = true; },
  };
  return { connection, calls };
}

test.beforeEach(() => { invalidateCallCount = 0; });

test('B1.2-import-success: masterDataTransferController.import() for resource=standards invalidates exactly once AFTER commit() succeeds', async () => {
  const { connection, calls } = makeMockImportConnection();
  installFakeDb(makeFakeDb({
    getConnectionImpl: () => connection,
    topLevelPromiseQueryImpl: () => { throw new Error('not used'); },
  }));
  const masterDataTransferController = freshModule(TRANSFER_CTRL_PATH);

  const file_base64 = await buildStandardsXlsxBase64([
    { process_id: 1, product_code: 'P1', standard_output: 100, exclude_kqd_from_tt: 0, status: 'active' },
  ]);
  const req = adminReq({ params: { resource: 'standards' }, body: { file_base64 } });
  const res = makeMockRes();
  let nextError = null;
  await masterDataTransferController.import(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null, 'import() should not call next(error) on success: ' + (nextError && nextError.message));
  assert.equal(res.body?.success, true, 'expected success:true, got: ' + JSON.stringify(res.body));
  assert.equal(calls.committed, true);
  assert.equal(calls.rolledBack, false);
  assert.equal(invalidateCallCount, 1, 'invalidateStandardResolutionCache() must be called exactly once after import() commits');
});

test('B1.2-import-success-machines: masterDataTransferController.import() for resource=machines also invalidates exactly once on success', async () => {
  const { connection, calls } = makeMockImportConnection();
  installFakeDb(makeFakeDb({
    getConnectionImpl: () => connection,
    topLevelPromiseQueryImpl: () => { throw new Error('not used'); },
  }));
  const masterDataTransferController = freshModule(TRANSFER_CTRL_PATH);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('MayMoc');
  const columns = ['process_id', 'machine_code', 'machine_name', 'status'];
  sheet.columns = columns.map((key) => ({ header: key, key }));
  sheet.addRow({ process_id: 1, machine_code: 'M1', machine_name: 'Máy 1', status: 'active' });
  const buffer = await workbook.xlsx.writeBuffer();
  const file_base64 = Buffer.from(buffer).toString('base64');

  const req = adminReq({ params: { resource: 'machines' }, body: { file_base64 } });
  const res = makeMockRes();
  let nextError = null;
  await masterDataTransferController.import(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null, 'import() should not call next(error) on success: ' + (nextError && nextError.message));
  assert.equal(res.body?.success, true);
  assert.equal(calls.committed, true);
  assert.equal(invalidateCallCount, 1);
});

test('B1.2-import-row-failure: a DB error mid-loop (before commit) rolls back and does NOT invalidate', async () => {
  // Second row's INSERT throws -- simulates a real failure partway through
  // the row-by-row loop, before beginTransaction's commit is ever reached.
  const { connection, calls } = makeMockImportConnection({ failOnQueryMatching: /^INSERT INTO product_standards SET \?$/ });
  // Make the FIRST insert succeed and the SECOND fail by counting calls.
  let insertCount = 0;
  const originalQuery = connection.query;
  connection.query = async (sql, params) => {
    if (/^INSERT INTO product_standards SET \?$/.test(sql)) {
      insertCount += 1;
      if (insertCount === 2) throw new Error('SIMULATED_ROW_WRITE_FAILURE');
      return [{ insertId: 601 }];
    }
    return originalQuery(sql, params);
  };
  installFakeDb(makeFakeDb({
    getConnectionImpl: () => connection,
    topLevelPromiseQueryImpl: () => { throw new Error('not used'); },
  }));
  const masterDataTransferController = freshModule(TRANSFER_CTRL_PATH);

  const file_base64 = await buildStandardsXlsxBase64([
    { process_id: 1, product_code: 'P1', standard_output: 100, exclude_kqd_from_tt: 0, status: 'active' },
    { process_id: 1, product_code: 'P2', standard_output: 200, exclude_kqd_from_tt: 0, status: 'active' },
  ]);
  const req = adminReq({ params: { resource: 'standards' }, body: { file_base64 } });
  const res = makeMockRes();
  let nextError = null;
  await masterDataTransferController.import(req, res, (err) => { nextError = err; });

  // import()'s outer catch: status = error.status||error.statusCode||400 (<500) -> res.status(...).json(...), next() not called.
  assert.equal(nextError, null, 'a plain Error (no .status) is routed through res.status(400).json(), not next(), per the outer catch logic');
  assert.equal(res.statusCode, 400, 'expected the outer catch to respond with status 400 for this error shape, got ' + res.statusCode);
  assert.notEqual(res.body?.success, true, 'response must not report success; got: ' + JSON.stringify(res.body));
  assert.equal(calls.committed, false, 'commit() must never be reached when a row write fails mid-loop');
  assert.equal(calls.rolledBack, true, 'rollback() must have been called');
  assert.equal(invalidateCallCount, 0, 'invalidateStandardResolutionCache() must NOT be called when the import fails before commit');
});

test('B1.2-import-commit-failure: all rows succeed but commit() throws -- rollback runs, no invalidate', async () => {
  const { connection, calls } = makeMockImportConnection({ commitThrows: true });
  installFakeDb(makeFakeDb({
    getConnectionImpl: () => connection,
    topLevelPromiseQueryImpl: () => { throw new Error('not used'); },
  }));
  const masterDataTransferController = freshModule(TRANSFER_CTRL_PATH);

  const file_base64 = await buildStandardsXlsxBase64([
    { process_id: 1, product_code: 'P1', standard_output: 100, exclude_kqd_from_tt: 0, status: 'active' },
  ]);
  const req = adminReq({ params: { resource: 'standards' }, body: { file_base64 } });
  const res = makeMockRes();
  let nextError = null;
  await masterDataTransferController.import(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null, 'commit failure (plain Error, no .status) is routed through res.status(400).json()');
  assert.equal(res.statusCode, 400);
  assert.notEqual(res.body?.success, true);
  assert.equal(calls.committed, true, 'commit() was attempted (and threw)');
  assert.equal(calls.rolledBack, true, 'rollback() must have been called after commit() threw');
  assert.equal(invalidateCallCount, 0, 'invalidateStandardResolutionCache() must NOT be called when commit() throws');
});

// --- B) formulaSettingsController.js::updateProductRule --------------------

function makeFakeFormulaDb({ affectedRows = 1, updateThrows = false } = {}) {
  return makeFakeDb({
    getConnectionImpl: () => { throw new Error('updateProductRule should not need getConnection()'); },
    topLevelPromiseQueryImpl: (sql, params) => {
      if (/^SELECT id,process_id FROM product_standards WHERE id=\? LIMIT 1$/.test(sql)) {
        return [[{ id: Number(params[0]), process_id: 1 }]];
      }
      if (/^UPDATE product_standards SET exclude_kqd_from_tt=\? WHERE id=\?$/.test(sql)) {
        if (updateThrows) throw new Error('SIMULATED_UPDATE_FAILURE');
        return [{ affectedRows }];
      }
      throw new Error('Unexpected mock formula db.promise().query: ' + sql);
    },
  });
}

test('B1.2-formula-update-success: updateProductRule() invalidates exactly once after a successful UPDATE (affectedRows=1)', async () => {
  installFakeDb(makeFakeFormulaDb({ affectedRows: 1 }));
  const formulaSettingsController = freshModule(FORMULA_CTRL_PATH);

  const req = adminReq({ params: { id: '10' }, body: { exclude_kqd_from_tt: 1 } });
  const res = makeMockRes();
  let nextError = null;
  await formulaSettingsController.updateProductRule(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null, 'should not call next(error) on success: ' + (nextError && nextError.message));
  assert.equal(res.body?.success, true, 'expected success:true, got: ' + JSON.stringify(res.body));
  assert.equal(invalidateCallCount, 1, 'invalidateStandardResolutionCache() must be called exactly once after a successful UPDATE');
});

test('B1.2-formula-update-not-found: updateProductRule() must NOT invalidate when UPDATE affects 0 rows (not found)', async () => {
  installFakeDb(makeFakeFormulaDb({ affectedRows: 0 }));
  const formulaSettingsController = freshModule(FORMULA_CTRL_PATH);

  const req = adminReq({ params: { id: '999' }, body: { exclude_kqd_from_tt: 1 } });
  const res = makeMockRes();
  let nextError = null;
  await formulaSettingsController.updateProductRule(req, res, (err) => { nextError = err; });

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 404, 'expected 404 when affectedRows=0, got ' + res.statusCode);
  assert.notEqual(res.body?.success, true);
  assert.equal(invalidateCallCount, 0, 'invalidateStandardResolutionCache() must NOT be called when affectedRows=0 (not found)');
});

test('B1.2-formula-update-db-error: updateProductRule() must NOT invalidate when the UPDATE query itself throws', async () => {
  installFakeDb(makeFakeFormulaDb({ updateThrows: true }));
  const formulaSettingsController = freshModule(FORMULA_CTRL_PATH);

  const req = adminReq({ params: { id: '10' }, body: { exclude_kqd_from_tt: 1 } });
  const res = makeMockRes();
  let nextError = null;
  await formulaSettingsController.updateProductRule(req, res, (err) => { nextError = err; });

  assert.notEqual(nextError, null, 'updateProductRule() routes a thrown DB error through next(error) per its catch block');
  assert.equal(nextError?.message, 'SIMULATED_UPDATE_FAILURE');
  assert.equal(invalidateCallCount, 0, 'invalidateStandardResolutionCache() must NOT be called when the UPDATE query throws');
});

test.after(() => {
  standardResolutionService.invalidateStandardResolutionCache = originalInvalidate;
  delete require.cache[DB_PATH];
  delete require.cache[TRANSFER_CTRL_PATH];
  delete require.cache[FORMULA_CTRL_PATH];
});
