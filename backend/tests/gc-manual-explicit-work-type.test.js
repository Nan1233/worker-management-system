const test = require('node:test');
const assert = require('node:assert/strict');

// Isolated: db stubbed, nothing leaves this process.
const MACHINES = { C13: 'CUT', ML4: 'LONG', C14: null };
const dbPath = require.resolve('../config/db');
function fakeRows(sql, params) {
  const t = String(sql).replace(/\s+/g, ' ').toLowerCase();
  if (t.includes('from worker_processes')) return [{ 1: 1 }];
  if (t.includes('from processes where id')) return [{ process_code: 'GC' }];
  if (t.includes('from machines')) {
    const code = String(params[params.length - 1] ?? '').trim().toUpperCase();
    return code in MACHINES ? [{ id: 5, machine_code: code, gc_work_type: MACHINES[code], is_automatic: 0, process_code: 'GC' }] : [];
  }
  if (t.includes('from product_standards ps join processes')) {
    return [{ id: 1, product_code: '15U-L', encoding_code: null, standard_output: 200, exclude_kqd_from_tt: 0, process_code: 'GC', has_machine_specific_standard: 0 }];
  }
  if (t.includes('from product_standards')) {
    return t.includes("in ('lồng','long')") ? [{ product_standard_id: 1, product_code: '15U-L', encoding_code: null, work_type: 'Lồng', standard_output: 200, exclude_kqd_from_tt: 0 }] : [];
  }
  return [];
}
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true,
  exports: {
    query(sql, params, cb) { const done = typeof params === 'function' ? params : cb; const p = typeof params === 'function' ? [] : params; try { done(null, fakeRows(sql, p)); } catch (e) { done(e); } },
    promise() { return { query: async (sql, params = []) => [fakeRows(sql, params)] }; }
  }
};
const { validateMasterData } = require('../services/reportBusinessValidationService');

const base = { workerId: 7, processId: 1, productName: '15U-L', defects: [], deductions: [], workDate: '2026-10-07', allowEmptyMachine: true };

test('manual GC report without a machine and the worker choosing Lồng resolves (the reported 15U-L case)', async () => {
  const r = await validateMasterData({ ...base, machineNo: '', operationMode: 'MANUAL', operationType: 'NEST' });
  assert.equal(r.valid, true, JSON.stringify(r.errors));
  assert.equal(Number(r.standardOutput), 200);
});

test('accepted spellings of the worker choice: LONG and Lồng behave as Lồng', async () => {
  for (const v of ['LONG', 'Lồng', 'nest']) {
    const r = await validateMasterData({ ...base, machineNo: '', operationMode: 'MANUAL', operationType: v });
    assert.equal(r.valid, true, v);
  }
});

// TEST-branch rule (kept as is): a manual GC report with no machine and no explicit choice defaults to Lồng.
test('manual GC with no machine and no explicit work type keeps the TEST-branch default (Lồng)', async () => {
  const r = await validateMasterData({ ...base, machineNo: '', operationMode: 'MANUAL', operationType: null });
  assert.equal(r.valid, true, JSON.stringify(r.errors));
});

test('manual Cắt choice looks up the Cắt standard (not Lồng): no Cắt standard exists in this fixture so it fails closed', async () => {
  await assert.rejects(validateMasterData({ ...base, machineNo: '', operationMode: 'MANUAL', operationType: 'CUT' }),
    (e) => e.code === 'HISTORICAL_STANDARD_NOT_FOUND');
});

test('machine report: a worker choice that contradicts the machine master is rejected, a matching one is accepted', async () => {
  await assert.rejects(validateMasterData({ ...base, machineNo: 'ML4', operationMode: 'MACHINE', operationType: 'CUT' }),
    (e) => e.code === 'GC_WORK_TYPE_MISMATCH');
  const ok = await validateMasterData({ ...base, machineNo: 'ML4', operationMode: 'MACHINE', operationType: 'NEST' });
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));
});

test('machine report without a worker choice still uses the machine master; unconfigured machine (C14) is rejected', async () => {
  const ok = await validateMasterData({ ...base, machineNo: 'ML4', operationMode: 'MACHINE' });
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));
  await assert.rejects(validateMasterData({ ...base, machineNo: 'C14', operationMode: 'MACHINE', operationType: 'CUT' }),
    (e) => e.code === 'GC_WORK_TYPE_UNRESOLVED');
});
