'use strict';
// Business / security regressions around the subrequest hotfix of PUT /api/production-temp/:id, driven through the whole
// Express stack (auth, role, permission, edit-window middleware, controller, model) against the fake DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { state, today, ts, UPD, freshRequire } = require('./helpers/tempEditFakeDb');

const line = (i) => ({ machine_code: `M0${5 + i}`, product_code: `P${i + 1}`, actual_time_hours: 2, machine_time_hours: 3, deduction_time_hours: 1, deductions: [], ok_quantity: 100, ng_quantity: 2, standard_output: 500, defects: [{ defect_type_id: 11, defect_code: 'X', defect_name: 'Vỡ', quantity: 2 }] });
const body = (n, extra = {}) => {
  const ms = Array.from({ length: n }, (_, i) => line(i));
  return { process_id: 1, work_date: today, shift: 'A', operation_mode: 'MACHINE', machine_no: ms.map((m) => m.machine_code).join(', '), product_name: ms.map((m) => m.product_code).join(', '), total_time: 0, actual_time: 0, deduction_time: 0, standard_output: 1000, actual_output: 0, tt_ok: 100 * n, tt_ng: 2 * n, note: 'sửa', extra_data: { adjustment_count: 0 }, defects: [], deductions: [], machine_lines: ms, updated_at: UPD, expected_updated_at: UPD, ...extra };
};
async function put(payload, { role = 'worker', workerId = 7, lineCount = 2, createdAgoMs = 60e3, managerProcessIds = [1], machineType = 'CUT' } = {}) {
  Object.assign(state, { sqls: [], failOn: null, failMessage: null, failRollback: false, lineCount, committed: 0, createdAgoMs, managerProcessIds, machineType, workerAssigned: true });
  state.user = { id: 70, username: 'u70', role, status: 'active', worker_id: role === 'worker' ? workerId : null, worker_status: role === 'worker' ? 'active' : null, database_name: 'ktc_test' };
  const { app } = freshRequire('server.js');
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const quiet = console.error; console.error = () => {};
  try {
    const token = jwt.sign({ id: 70, username: 'u70', role, worker_id: state.user.worker_id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/production-temp/900001`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => null);
    await new Promise((r) => setTimeout(r, 120));
    return { status: res.status, json, sqls: state.sqls, committed: state.committed };
  } finally { console.error = quiet; await new Promise((r) => server.close(r)); }
}
const writes = (sqls) => sqls.filter((q) => /^(INSERT|UPDATE|DELETE)/.test(q.sql) && !/INTO activity_logs/.test(q.sql));

test('stale expected_updated_at -> 409 and no data is written', async () => {
  const stale = ts(5 * 60e3);
  const r = await put(body(2, { expected_updated_at: stale, updated_at: stale }));
  assert.equal(r.status, 409, JSON.stringify(r.json));
  assert.equal(r.json.code, 'TEMP_REPORT_VERSION_CONFLICT');
  assert.equal(r.committed, 0);
  assert.equal(writes(r.sqls).length, 0);
});

test('a worker cannot edit another worker\'s report', async () => {
  const r = await put(body(2), { workerId: 9 });
  assert.equal(r.status, 403, JSON.stringify(r.json));
  assert.equal(writes(r.sqls).length, 0);
  assert.equal(r.committed, 0);
});

test('a manager outside the process scope is refused before any write', async () => {
  const r = await put(body(2), { role: 'manager', managerProcessIds: [99] });
  assert.equal(r.status, 403, JSON.stringify(r.json));
  assert.equal(r.json.code, 'PROCESS_SCOPE_FORBIDDEN');
  assert.equal(writes(r.sqls).length, 0);
});

test('worker edit window (10 minutes) is still enforced', async () => {
  const r = await put(body(2), { createdAgoMs: 11 * 60e3 });
  assert.equal(r.status, 422, JSON.stringify(r.json));
  assert.equal(writes(r.sqls).length, 0);
});

test('GC: explicit work type that contradicts the machine type is still rejected (master check not skipped)', async () => {
  const r = await put(body(2, { operation_type: 'LONG' }), { machineType: 'CUT' });
  assert.equal(r.status, 422, JSON.stringify(r.json));
  assert.equal(r.json.code, 'GC_WORK_TYPE_MISMATCH');
  assert.equal(r.committed, 0);
  assert.equal(writes(r.sqls).length, 0);
  assert.ok(r.sqls.some((q) => /FROM product_standards/.test(q.sql)), 'full master check ran for the mismatching choice');
});

test('GC: explicit work type equal to the machine type is accepted and skips only the duplicate lookups', async () => {
  const r = await put(body(2, { operation_type: 'CUT' }), { machineType: 'CUT' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.committed, 1);
  assert.equal(r.sqls.some((q) => /SELECT ps\.id, ps\.product_code/.test(q.sql)), false, 'redundant first-line product lookup skipped');
  assert.ok(r.sqls.some((q) => /FROM worker_processes/.test(q.sql)), 'process assignment is still checked');
});

test('validateMasterData(reuseValidatedMachine) still enforces assignment and defect/deduction masters', async () => {
  const { validateMasterData } = freshRequire('services/reportBusinessValidationService.js');
  const common = { workerId: 7, processId: 1, machineNo: 'M05', productName: 'P1', defects: [], deductions: [], operationMode: 'MACHINE', workDate: today, reuseValidatedMachine: { machineCode: 'M05', productCode: 'P1' }, knownProcessCode: 'GC' };
  Object.assign(state, { sqls: [], workerAssigned: true });
  const ok = await validateMasterData(common);
  assert.equal(ok.valid, true, JSON.stringify(ok.errors));
  assert.equal(ok.machineCode, 'M05');
  assert.equal(ok.productCode, 'P1');
  assert.equal(state.sqls.filter((q) => /FROM (machines|product_standards|processes)|product_aliases|product_standard_versions/.test(q.sql)).length, 0);

  state.workerAssigned = false;
  const notAssigned = await validateMasterData(common);
  assert.equal(notAssigned.valid, false);
  assert.ok(notAssigned.errors.process_id);

  state.workerAssigned = true;
  const badDefect = await validateMasterData({ ...common, defects: [{ defect_type_id: 11, quantity: 1 }, { defect_type_id: 99, quantity: 1 }] });
  assert.equal(badDefect.valid, false);
  assert.ok(badDefect.errors.defects);

  state.sqls = [];
  await validateMasterData({ ...common, reuseValidatedMachine: null, knownProcessCode: null });
  assert.ok(state.sqls.some((q) => /FROM machines/.test(q.sql)) && state.sqls.some((q) => /FROM product_standards/.test(q.sql)), 'default path unchanged');
});
