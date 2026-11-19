'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const dbPath = require.resolve('../config/db');

function buildFakeDb({ assignments = {}, batches = [], logsByBatch = {} } = {}) {
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
          // permissionService probes for the optional override tables; a count below 2 is the supported legacy-schema state.
          if (/information_schema\.tables/i.test(sql) && /role_permission_overrides/i.test(sql)) return [[{ total: 0 }], []];
          if (/^SELECT \* FROM excel_sync_batches (WHERE performed_by=\?|ORDER BY id DESC LIMIT)/i.test(sql)) {
            const owned = /WHERE performed_by=\?/i.test(sql);
            const cursor = /AND id<\?/i.test(sql);
            const limit = Number(params[owned ? (cursor ? 2 : 1) : 0]);
            const result = batches
              .filter(b => !owned || Number(b.performed_by) === Number(params[0]))
              .filter(b => !cursor || Number(b.id) < Number(params[1]))
              .sort((a,b) => Number(b.id)-Number(a.id))
              .slice(0, limit);
            return [result, []];
          }
          if (/^SELECT id, performed_by FROM excel_sync_batches WHERE id=/i.test(sql)) {
            return [batches.filter(b => Number(b.id) === Number(params[0])).map(
              b => ({ id: b.id, performed_by: b.performed_by })
            ), []];
          }
          if (/^SELECT \* FROM excel_sync_logs WHERE batch_id IN \(/i.test(sql)) {
            const ids = new Set(params.map(Number));
            const rows = [...ids].flatMap(id =>
              (logsByBatch[id] || []).map(log => ({ ...log, batch_id: id }))
            );
            rows.sort((a, b) =>
              Number(a.batch_id) - Number(b.batch_id) ||
              Number(a.id || 0) - Number(b.id || 0)
            );
            return [rows, []];
          }
          if (/^SELECT \* FROM excel_sync_logs WHERE batch_id = \? ORDER BY id/i.test(sql)) {
            return [logsByBatch[Number(params[0])] || [], []];
          }
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


test('SECURITY: preview rejects missing actor before database access', async () => {
  const { fake, state } = buildFakeDb();
  const { svc, restore } = loadService(fake);
  try {
    await assert.rejects(
      svc.preview(validPayload(), null),
      e => e.statusCode === 401 && e.code === 'AUTH_REQUIRED'
    );
    assert.equal(state.getConnectionCount, 0);
    assert.equal(state.mutationSql.length, 0);
  } finally { restore(); }
});

test('SECURITY: apply rejects missing actor before database access', async () => {
  const { fake, state } = buildFakeDb();
  const { svc, restore } = loadService(fake);
  try {
    await assert.rejects(
      svc.apply(validPayload(), null),
      e => e.statusCode === 401 && e.code === 'AUTH_REQUIRED'
    );
    assert.equal(state.getConnectionCount, 0);
    assert.equal(state.beginCount, 0);
    assert.equal(state.mutationSql.length, 0);
  } finally { restore(); }
});

test('SECURITY: preview denies worker and lead roles', async () => {
  for (const role of ['worker', 'lead']) {
    const { fake, state } = buildFakeDb();
    const { svc, restore } = loadService(fake);
    try {
      await assert.rejects(
        svc.preview(validPayload(), { id: 50, role }),
        e => e.statusCode === 403 && e.code === 'ROLE_DENIED'
      );
      assert.equal(state.getConnectionCount, 0);
      assert.equal(state.mutationSql.length, 0);
    } finally { restore(); }
  }
});

test('SECURITY: actor with invalid ID is rejected', async () => {
  const { fake, state } = buildFakeDb();
  const { svc, restore } = loadService(fake);
  try {
    await assert.rejects(
      svc.preview(validPayload(), { id: 0, role: 'admin' }),
      e => e.statusCode === 401 && e.code === 'AUTH_REQUIRED'
    );
    assert.equal(state.getConnectionCount, 0);
  } finally { restore(); }
});

test('SECURITY FIX61-65: history rejects missing actor', async () => {
  const { fake } = buildFakeDb();
  const { svc, restore } = loadService(fake);
  try {
    await assert.rejects(
      svc.listBatches(50, null),
      e => e.statusCode === 401 && e.code === 'AUTH_REQUIRED'
    );

    await assert.rejects(
      svc.getBatchLogs(1, null),
      e => e.statusCode === 401 && e.code === 'AUTH_REQUIRED'
    );
  } finally { restore(); }
});

test('SECURITY FIX61-65: history rejects unauthorized roles', async () => {
  const { fake } = buildFakeDb();
  const { svc, restore } = loadService(fake);
  try {
    for (const role of ['worker', 'lead']) {
      const actor = { id: 50, role };

      await assert.rejects(
        svc.listBatches(50, actor),
        e => e.statusCode === 403 && e.code === 'ROLE_DENIED'
      );

      await assert.rejects(
        svc.getBatchLogs(1, actor),
        e => e.statusCode === 403 && e.code === 'ROLE_DENIED'
      );
    }
  } finally { restore(); }
});

test('SECURITY FIX76-80: manager batch process scope', async () => {
  const batches = [
    { id: 10, performed_by: 50 },
    { id: 11, performed_by: 50 }
  ];

  const logsByBatch = {
    10: [{ old_data: JSON.stringify({ process_id: 1 }), new_data: null }],
    11: [{ old_data: JSON.stringify({ process_id: 2 }), new_data: null }]
  };

  const { fake } = buildFakeDb({
    assignments: { 50: [1] },
    batches,
    logsByBatch
  });

  const { svc, restore } = loadService(fake);

  try {
    const result = await svc.listBatches(50, { id: 50, role: 'manager' });
    assert.deepEqual(result.map(b => b.id), [10]);
  } finally { restore(); }
});

test('SECURITY FIX76-80: manager cannot read another process log', async () => {
  const batches = [{ id: 11, performed_by: 50 }];
  const logsByBatch = {
    11: [{ old_data: JSON.stringify({ process_id: 2 }), new_data: null }]
  };

  const { fake } = buildFakeDb({
    assignments: { 50: [1] },
    batches,
    logsByBatch
  });

  const { svc, restore } = loadService(fake);

  try {
    await assert.rejects(
      svc.getBatchLogs(11, { id: 50, role: 'manager' }),
      e => e.code === 'PROCESS_SCOPE_FORBIDDEN'
    );
  } finally { restore(); }
});

test('SECURITY FIX76-80: missing process ID fails closed', async () => {
  const batches = [{ id: 12, performed_by: 50 }];
  const logsByBatch = {
    12: [{ old_data: JSON.stringify({ name: 'unknown' }), new_data: null }]
  };

  const { fake } = buildFakeDb({
    assignments: { 50: [1] },
    batches,
    logsByBatch
  });

  const { svc, restore } = loadService(fake);

  try {
    await assert.rejects(
      svc.getBatchLogs(12, { id: 50, role: 'manager' }),
      e => e.code === 'MASTER_SYNC_HISTORY_PROCESS_UNKNOWN'
    );
  } finally { restore(); }
});

test('SECURITY FIX76-80: admin retains global batch history', async () => {
  const batches = [
    { id: 10, performed_by: 50 },
    { id: 11, performed_by: 60 }
  ];

  const { fake } = buildFakeDb({ batches });
  const { svc, restore } = loadService(fake);

  try {
    const result = await svc.listBatches(50, { id: 1, role: 'admin' });
    assert.deepEqual(result.map(b => b.id), [11, 10]);
  } finally { restore(); }
});
test('STEP104: manager pagination finds older authorized batch', async () => {
  const batches = Array.from({ length: 61 }, (_, i) => ({
    id: 61 - i,
    performed_by: 50
  }));

  batches.push({ id: 100, performed_by: 60 });

  const logsByBatch = {};
  for (const batch of batches) {
    logsByBatch[batch.id] = [{
      old_data: JSON.stringify({
        process_id: batch.id === 1 ? 1 : 2
      }),
      new_data: null
    }];
  }

  const { fake } = buildFakeDb({
    assignments: { 50: [1] },
    batches,
    logsByBatch
  });

  const { svc, restore } = loadService(fake);

  try {
    const result = await svc.listBatches(1, {
      id: 50,
      role: 'manager'
    });

    assert.deepEqual(result.map(b => b.id), [1]);
  } finally {
    restore();
  }
});
test('STEP105: history security edge cases - invalid logs are hidden', async () => {
  const batches = [
    { id: 3, performed_by: 50 },
    { id: 2, performed_by: 50 },
    { id: 1, performed_by: 50 },
    { id: 4, performed_by: 60 }
  ];

  const logsByBatch = {
    3: [{ old_data: JSON.stringify({ name: 'unknown' }), new_data: null }],
    2: [{ old_data: '{invalid-json', new_data: null }],
    1: [{ old_data: JSON.stringify({ process_id: 1 }), new_data: null }],
    4: [{ old_data: JSON.stringify({ process_id: 1 }), new_data: null }]
  };

  const { fake } = buildFakeDb({
    assignments: { 50: [1] },
    batches,
    logsByBatch
  });

  const { svc, restore } = loadService(fake);

  try {
    const result = await svc.listBatches(2, { id: 50, role: 'manager' });
    assert.deepEqual(result.map(b => b.id), [1]);

    await assert.rejects(
      svc.getBatchLogs(3, { id: 50, role: 'manager' }),
      e => e.code === 'MASTER_SYNC_HISTORY_PROCESS_UNKNOWN'
    );

    await assert.rejects(
      svc.getBatchLogs(4, { id: 50, role: 'manager' }),
      e => e.code === 'PROCESS_SCOPE_FORBIDDEN'
    );
  } finally {
    restore();
  }
});

test('STEP105: history security edge cases - admin limit', async () => {
  const batches = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    performed_by: i + 1
  }));

  const { fake } = buildFakeDb({ batches });
  const { svc, restore } = loadService(fake);

  try {
    const result = await svc.listBatches(3, { id: 1, role: 'admin' });
    assert.deepEqual(result.map(b => b.id), [10, 9, 8]);
  } finally {
    restore();
  }
});

test('STEP107: revoked Excel sync permission denies history methods', async () => {
  const permissionPath = require.resolve('../services/permissionService');
  const permissionService = require(permissionPath);
  const originalHasPermission = permissionService.hasPermission;

  permissionService.hasPermission = async (actor, code) => {
    if (code === 'EXCEL_MASTER_SYNC' && actor?.id === 50) {
      return false;
    }
    return originalHasPermission(actor, code);
  };

  const { fake, state } = buildFakeDb({
    assignments: { 50: [1] },
    batches: [{ id: 1, performed_by: 50 }],
    logsByBatch: {
      1: [{
        old_data: JSON.stringify({ process_id: 1 }),
        new_data: null
      }]
    }
  });

  let restore;

  try {
    const loaded = loadService(fake);
    restore = loaded.restore;

    const actor = { id: 50, role: 'manager' };

    await assert.rejects(
      loaded.svc.listBatches(50, actor),
      e => e.statusCode === 403 && e.code === 'PERMISSION_DENIED'
    );

    await assert.rejects(
      loaded.svc.getBatchLogs(1, actor),
      e => e.statusCode === 403 && e.code === 'PERMISSION_DENIED'
    );

    assert.equal(state.getConnectionCount, 0);
  } finally {
    if (restore) restore();
    permissionService.hasPermission = originalHasPermission;
  }
});