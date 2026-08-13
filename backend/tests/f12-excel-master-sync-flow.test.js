'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const dbPath = require.resolve('../config/db');

function buildFakeDb({ assignments = {} } = {}) {
  const state = {
    getConnectionCount: 0,
    beginCount: 0,
    commitCount: 0,
    rollbackCount: 0,
    mutationSql: [],
    productInsertParams: null,
    nextInsertId: 100
  };

  function connection() {
    return {
      async beginTransaction() { state.beginCount += 1; },
      async commit() { state.commitCount += 1; },
      async rollback() { state.rollbackCount += 1; },
      release() {},
      async query(sql, params = []) {
        if (/^SELECT id, .* FROM (?:product_standards|defect_types|deduction_types|machines) WHERE process_id IN/i.test(sql)) {
          return [[], []];
        }
        if (/^INSERT INTO excel_sync_batches/i.test(sql)) {
          state.mutationSql.push(sql);
          return [{ insertId: state.nextInsertId++ }, []];
        }
        if (/^INSERT INTO product_standards/i.test(sql)) {
          state.mutationSql.push(sql);
          state.productInsertParams = params;
          return [{ insertId: state.nextInsertId++ }, []];
        }
        if (/^INSERT INTO excel_sync_logs/i.test(sql) || /^UPDATE excel_sync_batches/i.test(sql)) {
          state.mutationSql.push(sql);
          return [{ affectedRows: 1 }, []];
        }
        throw new Error(`Unexpected connection SQL: ${sql}`);
      }
    };
  }

  const fake = {
    promise() {
      return {
        async query(sql, params = []) {
          if (/manager_processes/i.test(sql)) {
            const actorId = Number(params[0]);
            return [(assignments[actorId] || []).map((process_id) => ({ process_id })), []];
          }
          throw new Error(`Unexpected pool SQL: ${sql}`);
        },
        async getConnection() {
          state.getConnectionCount += 1;
          return connection();
        }
      };
    }
  };
  return { fake, state };
}

function loadService(fakeDb) {
  delete require.cache[require.resolve('../services/excelMasterSyncService')];
  delete require.cache[require.resolve('../services/processAuthorizationService')];
  const old = require.cache[dbPath];
  require.cache[dbPath] = { id:dbPath, filename:dbPath, loaded:true, exports:fakeDb };
  const svc = require('../services/excelMasterSyncService');
  return {
    svc,
    restore() {
      delete require.cache[require.resolve('../services/excelMasterSyncService')];
      delete require.cache[require.resolve('../services/processAuthorizationService')];
      if (old) require.cache[dbPath] = old;
      else delete require.cache[dbPath];
    }
  };
}

const validPayload = (standard_output = 617.1) => ({
  entityType:'product_standards',
  rows:[{__rowNumber:2, process_id:1, product_code:'QC-1', standard_output, exclude_kqd_from_tt:0}],
  rejectOnInvalid:true,
  fileName:'master.xlsx'
});

test('F12 preview exposes field-specific invalid numeric error before any mutation', async () => {
  const {fake,state}=buildFakeDb();
  const {svc,restore}=loadService(fake);
  try {
    const result=await svc.preview(validPayload(''),{id:1,role:'admin'});
    assert.equal(result.invalid.length,1);
    assert.equal(result.invalid[0].code,'MASTER_NUMERIC_REQUIRED');
    assert.equal(result.invalid[0].field,'standard_output');
    assert.equal(state.beginCount,0);
    assert.equal(state.mutationSql.length,0);
  } finally { restore(); }
});

test('F12 apply revalidates and rejects blank required standard before opening mutation transaction', async () => {
  const {fake,state}=buildFakeDb();
  const {svc,restore}=loadService(fake);
  try {
    await assert.rejects(svc.apply(validPayload(''),{id:1,role:'admin'}),(e)=>e.statusCode===422 && e.code==='MASTER_VALIDATION_FAILED' && e.details?.invalid?.[0]?.code==='MASTER_NUMERIC_REQUIRED');
    assert.equal(state.getConnectionCount,1, 'only preview read connection is allowed');
    assert.equal(state.beginCount,0);
    assert.equal(state.mutationSql.length,0);
  } finally { restore(); }
});

test('F12 apply preserves decimal standard in authoritative product_standards INSERT payload', async () => {
  const {fake,state}=buildFakeDb();
  const {svc,restore}=loadService(fake);
  try {
    const result=await svc.apply(validPayload(900.77),{id:1,role:'admin'});
    assert.equal(result.invalid.length,0);
    assert.equal(state.beginCount,1);
    assert.equal(state.commitCount,1);
    assert.equal(state.rollbackCount,0);
    assert.ok(Array.isArray(state.productInsertParams));
    assert.equal(state.productInsertParams[2],900.77); // process_id, product_code, standard_output
  } finally { restore(); }
});

test('F12 blank update cannot overwrite an existing standard with zero because apply stops pre-transaction', async () => {
  const {fake,state}=buildFakeDb();
  const {svc,restore}=loadService(fake);
  try {
    await assert.rejects(svc.apply(validPayload('   '),{id:1,role:'admin'}));
    assert.equal(state.beginCount,0);
    assert.equal(state.mutationSql.length,0);
    assert.equal(state.productInsertParams,null);
  } finally { restore(); }
});

test('F12 F09 denies unauthorized process before deep invalid-standard preview is returned', async () => {
  const {fake,state}=buildFakeDb({assignments:{50:[1]}});
  const {svc,restore}=loadService(fake);
  try {
    const payload={...validPayload(''),rows:[{process_id:2,product_code:'MAI-X',standard_output:''}]};
    await assert.rejects(svc.preview(payload,{id:50,role:'manager'}),(e)=>e.statusCode===403 && e.code==='PROCESS_SCOPE_FORBIDDEN');
    assert.equal(state.getConnectionCount,0, 'authorization must fail before master data read/validation result');
    assert.equal(state.mutationSql.length,0);
  } finally { restore(); }
});

test('F12 authorized manager valid workbook can preview within own process', async () => {
  const {fake}=buildFakeDb({assignments:{50:[1]}});
  const {svc,restore}=loadService(fake);
  try {
    const result=await svc.preview(validPayload(1066.39),{id:50,role:'manager'});
    assert.equal(result.invalid.length,0);
    assert.equal(result.changes[0].newData.standard_output,1066.39);
  } finally { restore(); }
});
