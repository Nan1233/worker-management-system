'use strict';
// Behavioural guard for the worker/pending production-report edit flow (PUT /api/production-temp/:id).
// Runs productionTempUpdateModel.updateReport against a fake DB and inspects the SQL it issues.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const BACKEND = path.join(__dirname, '..');

function build({ current = {}, failOn = null, defectMaster = [{ id: 11, defect_name: 'Vỡ', status: 'active' }] } = {}) {
  const calls = [];
  const report = {
    id: 900001, worker_id: 7, process_id: 1, work_date: '2026-10-23', shift: 'DAY', status: 'pending',
    operation_mode: 'MACHINE', machine_no: 'M05', product_name: 'P1', actual_time: 0, total_time: 0, deduction_time: 0,
    tt_ok: 90, tt_ng: 10, actual_output: 100, standard_output: 0, exclude_kqd_from_tt_snapshot: 0,
    created_at: new Date(Date.now() - 60 * 1000).toISOString(), updated_at: '2026-10-23T01:00:00.000Z', ...current,
  };
  const answer = (rawSql) => {
    const sql = String(rawSql).replace(/\s+/g, ' ');
    if (failOn && failOn.test(sql)) throw Object.assign(new Error('boom'), { code: 'ER_FAKE' });
    if (/SELECT pr\.\* FROM production_reports_temp pr/.test(sql)) return [report];
    if (/FROM defect_types/.test(sql)) return defectMaster;
    if (/SELECT process_code FROM processes/.test(sql)) return [{ process_code: 'GC' }];
    if (/FROM production_temp_machine_lines WHERE temp_report_id/.test(sql)) return [];
    if (/SELECT COALESCE\(SUM\(counted_hours\)/.test(sql)) return [{ counted_hours: 0 }];
    if (/^INSERT/i.test(sql)) return { insertId: 1, affectedRows: 1 };
    return [];
  };
  const record = (s, p) => calls.push({ sql: String(s).replace(/\s+/g, ' ').trim(), params: p || [] });
  const conn = {
    supportsBeginIsolation: true,
    query(sql, p, cb) {
      if (typeof p === 'function') { cb = p; p = []; }
      record(sql, p);
      let r; let err = null;
      try { r = answer(sql); } catch (e) { err = e; }
      if (!cb) return err ? Promise.reject(err) : Promise.resolve([r, []]);
      setImmediate(() => cb(err, r, []));
    },
    beginTransaction(a, b) { const cb = typeof a === 'function' ? a : b; record('BEGIN'); setImmediate(() => cb(null)); },
    commit(cb) { record('COMMIT'); setImmediate(() => cb(null)); },
    rollback(cb) { record('ROLLBACK'); setImmediate(() => cb(null)); },
    release() {},
  };
  const fakeDb = { getConnection(cb) { setImmediate(() => cb(null, conn)); }, query() {}, promise() { return { query: async () => [[], []] }; } };
  const machineLinesWritten = [];
  const fakes = {
    'services/auditService': { loadTempReportSnapshot: async () => ({ id: 900001 }), createReportVersion: async () => {}, logActivity: async () => {}, createNotification: async () => {} },
    'services/machineLineValidationService': { validateMachineLines: async ({ machineLines }) => ({ valid: true, lines: machineLines, errors: {} }) },
    'services/factoryMachineRuleService': { validateMachineWorkerCapacityLocked: async () => ({ valid: true }) },
    'models/productionTempCreateModel': { replaceMachineLines: async (id, lines) => { machineLinesWritten.push(lines); } },
  };
  const original = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (/config\/db$/.test(request)) return fakeDb;
    for (const [key, value] of Object.entries(fakes)) if (request.endsWith(path.basename(key)) && /^\.\.?\//.test(request)) return value;
    return original.call(this, request, parent, ...rest);
  };
  let Model;
  try {
    for (const n of ['models/productionTempUpdateModel', 'models/productionTempModelShared']) { try { delete require.cache[require.resolve(path.join(BACKEND, n))]; } catch { /* */ } }
    Model = require(path.join(BACKEND, 'models/productionTempUpdateModel.js'));
  } finally { Module._load = original; }
  Model.logAction = async () => {};
  return { Model, calls, report, machineLinesWritten };
}

const quiet = async (fn) => { const o = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {}; try { return await fn(); } finally { [console.log, console.warn, console.error] = o; } };
const updateSql = (calls) => calls.find((c) => /^UPDATE production_reports_temp SET/.test(c.sql));
const assignedValue = (stmt, field) => {
  const fields = [...stmt.sql.matchAll(/`(\w+)` = \?/g)].map((m) => m[1]);
  const i = fields.indexOf(field);
  return i < 0 ? undefined : stmt.params[i];
};

const machineLine = { machine_code: 'M05', product_code: 'P1', ok_quantity: 90, ng_quantity: 10, defects: [{ defect_code: 'X', defect_name: 'Vỡ', quantity: 10 }] };
const ADMIN = { isAdmin: false, workerId: 7 };

test('machine report edit keeps the machine-line NG total when the parent defect list is empty', async () => {
  const { Model, calls } = build();
  await quiet(() => Model.updateReport(900001, { note: 'sửa', tt_ok: 90, tt_ng: 10, actual_output: 100, defects: [], deductions: [], machine_lines: [machineLine] }, 70, null, ADMIN));
  const upd = updateSql(calls);
  const ng = upd ? assignedValue(upd, 'tt_ng') : undefined;
  assert.ok(ng === undefined || Number(ng) === 10, `tt_ng must stay 10 (machine total) but was ${ng}`);
});

test('controller only writes child collections the client sent', () => {
  const { omitUnsentCollections } = require('../utils/editPayload');
  const update = { tt_ng: 10, defects: [{ defect_name: 'merged-from-machine' }], deductions: [{ deduction_name: 'x' }] };
  assert.deepEqual(Object.keys(omitUnsentCollections({ note: 'a' }, update)).sort(), ['tt_ng']);
  assert.deepEqual(Object.keys(omitUnsentCollections({ defects: [] }, update)).sort(), ['defects', 'tt_ng']);
  assert.deepEqual(Object.keys(omitUnsentCollections({ defects: null, deductions: [] }, update)).sort(), ['deductions', 'tt_ng']);
  assert.equal(Object.keys(update).length, 3, 'input must not be mutated');
});

test('controller wires omitUnsentCollections into the update call', () => {
  const src = require('node:fs').readFileSync(path.join(BACKEND, 'controllers/productionTempManagementController.js'), 'utf8');
  assert.match(src, /updateReport\(\s*reportId,\s*omitUnsentCollections\(req\.body, preserveStoredMachineData\(req\.body, normalizedUpdate\)\)/);
});

test('machine lines are replaced and the NG column equals the machine total in the same transaction', async () => {
  const { Model, calls, machineLinesWritten } = build();
  const result = await quiet(() => Model.updateReport(900001, { tt_ok: 80, tt_ng: 20, actual_output: 100, defects: [], deductions: [], machine_lines: [{ ...machineLine, ok_quantity: 80, ng_quantity: 20 }] }, 70, null, ADMIN));
  assert.equal(result.changed, true);
  assert.equal(machineLinesWritten.length, 1);
  assert.equal(Number(assignedValue(updateSql(calls), 'tt_ng')), 20);
  const names = calls.map((c) => c.sql.split(' ')[0]);
  assert.equal(names[0], 'BEGIN'.split(' ')[0]);
  assert.equal(names.filter((n) => n === 'COMMIT').length, 1);
  assert.equal(names.includes('ROLLBACK'), false);
});

test('manual report: defects still drive tt_ng and replace the child rows', async () => {
  const { Model, calls } = build({ current: { operation_mode: 'MANUAL', machine_no: null, tt_ng: 3, tt_ok: 97, actual_output: 100 } });
  await quiet(() => Model.updateReport(900001, { tt_ok: 95, tt_ng: 5, actual_output: 100, defects: [{ defect_type_id: 11, defect_name: 'Vỡ', quantity: 5 }], deductions: [] }, 70, null, ADMIN));
  assert.equal(Number(assignedValue(updateSql(calls), 'tt_ng')), 5);
  assert.ok(calls.some((c) => /^DELETE FROM production_temp_defects/.test(c.sql)));
  assert.ok(calls.some((c) => /^INSERT INTO production_temp_defects/.test(c.sql)));
});

test('partial payload (no defects/deductions/machine_lines keys) leaves child data untouched', async () => {
  const { Model, calls } = build();
  await quiet(() => Model.updateReport(900001, { note: 'chỉ sửa ghi chú' }, 70, null, ADMIN));
  assert.equal(calls.some((c) => /^DELETE FROM/.test(c.sql)), false);
  assert.equal(calls.some((c) => /^INSERT INTO production_temp_(defects|deductions)/.test(c.sql)), false);
});

test('mid-failure rolls back and never commits', async () => {
  const { Model, calls } = build({ failOn: /^INSERT INTO report_edit_logs/ });
  await assert.rejects(() => quiet(() => Model.updateReport(900001, { note: 'x', defects: [], deductions: [], machine_lines: [machineLine], tt_ng: 10 }, 70, null, ADMIN)));
  assert.equal(calls.some((c) => c.sql === 'COMMIT'), false);
  assert.equal(calls.some((c) => c.sql === 'ROLLBACK'), true);
});

test('worker cannot edit outside the 10 minute window', async () => {
  const { Model, calls } = build({ current: { created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() } });
  await assert.rejects(() => quiet(() => Model.updateReport(900001, { note: 'x' }, 70, null, ADMIN)), (e) => e.code === 'TEMP_REPORT_EDIT_WINDOW_EXPIRED');
  assert.equal(updateSql(calls), undefined);
});

test('stale expected_updated_at is rejected with 409 and writes nothing', async () => {
  const { Model, calls } = build();
  await assert.rejects(() => quiet(() => Model.updateReport(900001, { note: 'x' }, 70, null, { ...ADMIN, expectedUpdatedAt: '2026-10-23T00:00:00.000Z' })), (e) => e.status === 409);
  assert.equal(updateSql(calls), undefined);
});

test('approved reports cannot be edited through the temp table', async () => {
  const { Model, calls } = build({ current: { status: 'approved' } });
  await assert.rejects(() => quiet(() => Model.updateReport(900001, { note: 'x' }, 70, null, ADMIN)));
  assert.equal(updateSql(calls), undefined);
});

test('ownership is enforced in the locking SELECT for workers', async () => {
  const { Model, calls } = build();
  await quiet(() => Model.updateReport(900001, { note: 'x' }, 70, null, ADMIN));
  const sel = calls.find((c) => /SELECT pr\.\* FROM production_reports_temp pr/.test(c.sql));
  assert.match(sel.sql, /pr\.worker_id = \?/);
  assert.deepEqual(sel.params, [900001, 7]);
});

test('note-only edit of a machine report keeps stored machine lines and machine-derived parent columns', () => {
  const { preserveStoredMachineData } = require('../utils/editPayload');
  const update = { note: 'n', tt_ng: 10, tt_ok: 90, machine_no: 'M1, M2', machine_lines: [{ machine_code: 'M1' }, { machine_code: 'M2' }], operation_mode: 'MACHINE' };
  assert.deepEqual(preserveStoredMachineData({ note: 'n' }, update), { note: 'n' });
  assert.equal(preserveStoredMachineData({ machine_lines: [] }, update), update, 'explicit machine_lines (even empty) is honoured');
  assert.equal(preserveStoredMachineData({ machine_lines: [{}] }, update), update);
  const manual = { note: 'n', tt_ng: 1, machine_lines: [] };
  assert.equal(preserveStoredMachineData({ note: 'n' }, manual), manual, 'manual reports are not touched');
});

test('defects-only payload on a machine report does not overwrite the stored machine NG total', async () => {
  const { Model, calls } = build();
  await quiet(() => Model.updateReport(900001, { note: 'x', defects: [{ defect_type_id: 11, defect_name: 'Vỡ', quantity: 2 }] }, 70, null, ADMIN));
  const upd = updateSql(calls);
  const ng = upd ? assignedValue(upd, 'tt_ng') : undefined;
  assert.ok(ng === undefined, `tt_ng must not be rewritten from parent defects (got ${ng})`);
});
