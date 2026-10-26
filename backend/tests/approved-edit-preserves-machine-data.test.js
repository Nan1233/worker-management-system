'use strict';
// updateApprovedReport must never write production_report_machine_lines / machine defects, and must reject
// aggregate edits of machine reports. Fake DB + stubbed collaborators (no real database).
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const BACKEND = path.join(__dirname, '..');

function build({ mode = 'MACHINE', processId = 60001, actualTime = 8, machineNo = 'M1, M2', productName = 'P1, P2', storedDefects = [{ id: 1, report_id: 5001, defect_type_id: 11, quantity: 10 }] } = {}) {
  const sqls = [];
  const report = { id: 5001, worker_id: 7, process_id: processId, status: 'approved', operation_mode: mode, work_date: '2026-10-23', shift: 'A', machine_no: machineNo, product_name: productName, actual_time: actualTime, total_time: actualTime, deduction_time: 0, standard_output: 500, tt_ok: 90, tt_ng: 10, actual_output: 100, exclude_kqd_from_tt_snapshot: 0, note: '', updated_at: '2026-10-23 01:00:00' };
  const answer = (sql) => {
    if (/FROM production_reports pr JOIN processes p ON p.id=pr.process_id JOIN workers w ON w.id=pr.worker_id WHERE pr.id=\? FOR UPDATE/.test(sql)) return [[{ ...report, process_code: 'GC' }], []];
    if (/SELECT \* FROM production_reports WHERE id=\?/.test(sql)) return [[report], []];
    if (/FROM production_report_defects/.test(sql)) return [storedDefects, []];
    if (/FROM production_report_deductions/.test(sql)) return [[], []];
    if (/FROM production_report_machine_lines WHERE report_id/.test(sql)) return [[{ id: 1 }, { id: 2 }], []];
    if (/information_schema/.test(sql)) return [[{ present: 1 }], []];
    return [[], []];
  };
  const conn = {
    async beginTransaction() {}, async commit() { sqls.push('COMMIT'); }, async rollback() { sqls.push('ROLLBACK'); }, release() {},
    async query(sql) { const s = String(sql).replace(/\s+/g, ' ').trim(); sqls.push(s); return answer(s); },
  };
  const fakeDb = { promise() { return { getConnection: async () => conn, query: async (s) => answer(String(s)) }; }, query() {} };
  const stubs = {
    permissionService: { hasPermission: async () => true },
    processAuthorizationService: { assertProcessScope: async () => {} },
    reportBusinessValidationService: { validateMasterData: async ({ machineNo }) => (String(machineNo || '').includes(',') ? { valid: false, errors: { machine_no: 'Máy không tồn tại hoặc không thuộc công đoạn đã chọn' } } : { valid: true, standardOutput: 500, standardVersionId: null, machineStandardId: null, excludeKqdFromTt: 0, authoritativeDefects: [] }) },
    approvedVersionSnapshotService: { createApprovedReportVersion: async () => 2, parseSnapshotJson: (v) => v, loadApprovedAggregateSnapshot: async () => ({}), validateApprovedVersionSnapshot: () => ({}), assertApprovedVersionSnapshotSafe: () => {}, approvedSnapshotsEqual: () => true, REPORT_FIELDS: [], MACHINE_LINE_FIELDS: [] },
    auditService: { logActivity: async () => {} },
  };
  const original = Module._load;
  Module._load = function (request, ...rest) {
    if (/config\/db$/.test(request)) return fakeDb;
    const base = path.basename(request);
    if (/^\.\.?\//.test(request) && stubs[base]) return stubs[base];
    return original.call(this, request, ...rest);
  };
  let svc;
  try { delete require.cache[require.resolve(path.join(BACKEND, 'services/approvedReportEditService.js'))]; svc = require(path.join(BACKEND, 'services/approvedReportEditService.js')); } finally { Module._load = original; }
  return { svc, sqls };
}
const quiet = async (fn) => { const o = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {}; try { return await fn(); } finally { [console.log, console.warn, console.error] = o; } };
const run = (svc, patch) => quiet(() => svc.updateApprovedReport({ reportId: 5001, patch, reason: 'sửa', userId: 70, actor: { id: 70, role: 'manager' }, expectedUpdatedAt: '2026-10-23 01:00:00' }));

test('note-only edit of an approved machine report never writes machine lines or machine defects', async () => {
  const { svc, sqls } = build({ machineNo: 'M1', productName: 'P1' });
  await run(svc, { note: 'ghi chú mới' });
  assert.equal(sqls.some((s) => /^(DELETE FROM|INSERT INTO|UPDATE) production_report_machine_(lines|defects)/.test(s)), false);
  assert.ok(sqls.some((s) => /^UPDATE production_reports SET/.test(s)));
  assert.ok(sqls.includes('COMMIT'));
});

test('approved machine report rejects aggregate/defect/deduction edits instead of rewriting them', async () => {
  const { svc, sqls } = build();
  await assert.rejects(() => run(svc, { defects: [], deductions: [], tt_ng: 0 }), (e) => e.code === 'MACHINE_AGGREGATE_READ_ONLY');
  assert.equal(sqls.some((s) => /^(DELETE|UPDATE|INSERT)/.test(s)), false);
  assert.ok(sqls.includes('ROLLBACK'));
});

test('approved edit rewrites parent defect rows only from stored parent rows (no machine-derived rows)', async () => {
  const { svc, sqls } = build({ machineNo: 'M1', productName: 'P1' });
  await run(svc, { note: 'x' });
  const inserts = sqls.filter((s) => /^INSERT INTO production_report_defects/.test(s));
  assert.equal(inserts.length, 1);
});

test('approved GC multi-machine report (parent actual_time=0, joined machine/product names) can be note-edited', async () => {
  const { svc, sqls } = build({ processId: 1, actualTime: 0 });
  const result = await run(svc, { note: 'ghi chú mới' });
  assert.ok(result.version);
  assert.ok(sqls.some((s) => /^UPDATE production_reports SET/.test(s)));
  assert.equal(sqls.some((s) => /^(DELETE FROM|INSERT INTO|UPDATE) production_report_machine_(lines|defects)/.test(s)), false);
  assert.ok(sqls.includes('COMMIT'));
});

test('approved multi-machine note edit leaves aggregate columns exactly as stored', async () => {
  const { svc, sqls } = build({ processId: 1, actualTime: 0 });
  await run(svc, { note: 'x' });
  const upd = sqls.find((s) => /^UPDATE production_reports SET/.test(s));
  assert.match(upd, /note=\?/);
});

// API contract of PUT /production/:id (approved): a key that is NOT sent leaves that child collection as stored;
// a key sent as [] is an explicit instruction to clear it. The UI therefore must never default a missing
// collection to [] (see ManagerReportGrid guard).
test('CONTRACT manual approved report: defects/deductions not sent -> rewritten unchanged from stored rows', async () => {
  const { svc, sqls } = build({ mode: 'MANUAL', machineNo: 'M1', productName: 'P1' });
  await run(svc, { note: 'chỉ ghi chú' });
  const inserts = sqls.filter((s) => /^INSERT INTO production_report_defects/.test(s));
  assert.equal(inserts.length, 1, 'stored defect row is preserved');
});

test('CONTRACT manual approved report: defects sent as [] is an explicit clear (rows deleted, none re-inserted)', async () => {
  const { svc, sqls } = build({ mode: 'MANUAL', machineNo: 'M1', productName: 'P1' });
  await run(svc, { defects: [] });
  assert.ok(sqls.some((s) => /^DELETE FROM production_report_defects/.test(s)));
  assert.equal(sqls.some((s) => /^INSERT INTO production_report_defects/.test(s)), false);
});
