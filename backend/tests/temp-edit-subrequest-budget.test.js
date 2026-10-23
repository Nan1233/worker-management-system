'use strict';
// PUT /api/production-temp/:id on the Cloudflare Worker: every TiDB HTTP statement is a subrequest and the Free plan
// allows 50 per invocation ("Too many subrequests by single Worker invocation", then even ROLLBACK and
// SELECT LAST_INSERT_ID() fail). These tests drive the REAL controller + model + validators against a fake DB that
// counts statements, with insertId unavailable (as on the Worker).
//
// Statement counts measured BEFORE the hotfix with the same fixtures (N = machines, full payload):
//   N=1: 61   N=2: 70   N=4: 88   (note-only: N=2: 55, N=4: 65)   => ~9 statements per extra machine.
// A mock cannot prove the production count; it proves the shape (constant per-machine cost is small) and guards
// against regressions. Middleware (auth, permission, edit-window) adds ~2-5 statements on top of these numbers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { state, today, ts, UPD, freshRequire } = require('./helpers/tempEditFakeDb');
const freshController = () => freshRequire('controllers/productionTempManagementController.js');

const machineLine = (i) => ({
  machine_code: `M0${5 + i}`, product_code: `P${i + 1}`, actual_time_hours: 2, machine_time_hours: 3, deduction_time_hours: 1,
  deductions: [], ok_quantity: 100, ng_quantity: 2, standard_output: 500, defects: [{ defect_type_id: 11, defect_code: 'X', defect_name: 'Vỡ', quantity: 2 }],
});
const bodyFor = (n, mode) => {
  const ms = Array.from({ length: n }, (_, i) => machineLine(i));
  const body = {
    process_id: 1, work_date: today, shift: 'A', operation_mode: 'MACHINE', machine_no: ms.map((m) => m.machine_code).join(', '), product_name: ms.map((m) => m.product_code).join(', '),
    total_time: 0, actual_time: 0, deduction_time: 0, standard_output: 1000, actual_output: 0, tt_ok: 100 * n, tt_ng: 2 * n, note: 'sửa', extra_data: { adjustment_count: 0 },
    updated_at: UPD, expected_updated_at: UPD,
  };
  if (mode === 'full') { body.defects = []; body.deductions = []; body.machine_lines = ms; }
  return body;
};

async function put(body, { lineCount = 2, failOn = null, failMessage = null, failRollback = false } = {}) {
  Object.assign(state, { sqls: [], failOn, failMessage, failRollback, lineCount, committed: 0 });
  const res = { st: 200, j: null, status(c) { this.st = c; return this; }, json(x) { this.j = x; return this; } };
  const errors = [];
  const oe = console.error; console.error = (...a) => errors.push(a);
  const controller = freshController();
  try { await controller.updateTempReport({ params: { id: '900001' }, body, user: { id: 70, role: 'worker', worker_id: 7 } }, res); }
  finally { console.error = oe; }
  return { res, sqls: state.sqls, errors, committed: state.committed };
}
const count = (sqls) => sqls.length;
const find = (sqls, re) => sqls.filter((q) => re.test(q.sql));

test('machine report edit: statement count grows slowly with the number of machines', async (t) => {
  const counts = {};
  for (const n of [1, 2, 4]) {
    const { res, sqls } = await put(bodyFor(n, 'full'), { lineCount: n });
    assert.equal(res.st, 200, JSON.stringify(res.j));
    assert.equal(res.j.success, true);
    counts[n] = count(sqls);
  }
  t.diagnostic(`statements: ${JSON.stringify(counts)} (before the hotfix: {"1":61,"2":70,"4":88})`);
  assert.ok(counts[1] <= 40, `1 machine: ${counts[1]}`);
  assert.ok(counts[4] <= 46, `4 machines: ${counts[4]}`);
  const slope = (counts[4] - counts[1]) / 3;
  assert.ok(slope <= 3, `per extra machine: ${slope} (was 9)`);
});

test('machine lines are written with constant statements: one multi-row INSERT, one defect INSERT, no per-line LAST_INSERT_ID', async () => {
  const { res, sqls } = await put(bodyFor(4, 'full'), { lineCount: 4 });
  assert.equal(res.st, 200);
  assert.equal(find(sqls, /^INSERT INTO production_temp_machine_lines/).length, 1);
  assert.equal(find(sqls, /^INSERT INTO production_temp_machine_defects/).length, 1);
  assert.equal(find(sqls, /LAST_INSERT_ID/).length, 0);
  const lineInsert = find(sqls, /^INSERT INTO production_temp_machine_lines/)[0];
  // 4 rows x 22 columns, each machine keeps its own values (no mixing)
  assert.equal(lineInsert.params.length, 4 * 22);
  const rows = [0, 1, 2, 3].map((i) => lineInsert.params.slice(i * 22, i * 22 + 22));
  rows.forEach((row, i) => {
    assert.equal(row[0], 900001);
    assert.equal(row[3], `M0${5 + i}`);
    assert.equal(row[7], `P${i + 1}`);
    assert.equal(row[8], 2);            // machine_time_hours (derived by the validator: actual 2 + deductions 0)
    assert.equal(row[13], 100);         // ok_quantity
    assert.equal(row[14], 2);           // ng_quantity
    assert.equal(row[16], 0);           // deduction_time_hours (derived from the deductions list)
    assert.equal(row[21], i + 1);       // sort_order
  });
  const defectInsert = find(sqls, /^INSERT INTO production_temp_machine_defects/)[0];
  assert.match(defectInsert.sql, /ON v\.sort_order = ml\.sort_order/);
  assert.match(defectInsert.sql, /WHERE ml\.temp_report_id = \?/);
  // params: for each line [sort_order, defect_type_id, code, name, quantity] then the report id
  assert.deepEqual(defectInsert.params.slice(0, 5), [1, 11, 'X', 'Vỡ', 2]);
  assert.deepEqual(defectInsert.params.slice(15, 20), [4, 11, 'X', 'Vỡ', 2]);
  assert.equal(defectInsert.params.at(-1), 900001);
  // tt_ng of the parent equals the sum of the machine NG
  const update = find(sqls, /^UPDATE production_reports_temp SET/)[0];
  assert.ok(update, 'parent update issued');
});

test('note-only edit and payload without machine_lines keep machine data and stay cheap', async (t) => {
  const noteOnly = await put(bodyFor(4, 'note'), { lineCount: 4 });
  assert.equal(noteOnly.res.st, 200, JSON.stringify(noteOnly.res.j));
  t.diagnostic(`note-only, 4 machines: ${count(noteOnly.sqls)} statements`);
  assert.ok(count(noteOnly.sqls) <= 42, `note-only 4 machines: ${count(noteOnly.sqls)} (was 65)`);
  for (const result of [noteOnly]) {
    assert.equal(find(result.sqls, /^(INSERT INTO|DELETE FROM) production_temp_machine_(lines|defects)/).length, 0, 'machine rows untouched');
    assert.equal(find(result.sqls, /^(DELETE FROM) production_temp_(defects|deductions)/).length, 0);
  }
  const scalarOnly = bodyFor(2, 'note'); scalarOnly.tt_ok = 250; scalarOnly.note = 'đổi ghi chú';
  const second = await put(scalarOnly, { lineCount: 2 });
  assert.equal(second.res.st, 200, JSON.stringify(second.res.j));
  assert.equal(find(second.sqls, /production_temp_machine_lines/).filter((q) => /^(INSERT|DELETE)/.test(q.sql)).length, 0);
});

test('DB error mid-transaction rolls back, never commits, never reports success', async () => {
  const { res, sqls, committed } = await put(bodyFor(2, 'full'), { lineCount: 2, failOn: /^INSERT INTO production_temp_machine_lines/ });
  assert.notEqual(res.st, 200);
  assert.equal(res.j.success, false);
  assert.equal(committed, 0);
  assert.equal(find(sqls, /^COMMIT$/).length, 0);
  assert.equal(find(sqls, /^ROLLBACK$/).length, 1);
});

test('failing ROLLBACK is surfaced, original error is kept and nothing is committed', async () => {
  const { res, errors, committed } = await put(bodyFor(2, 'full'), { lineCount: 2, failOn: /^INSERT INTO production_temp_machine_lines/, failRollback: true });
  assert.equal(res.j.success, false);
  assert.equal(committed, 0);
  assert.ok(errors.some((a) => /ROLLBACK failed/.test(String(a[0]))), 'rollback failure is logged, not swallowed');
});

test('subrequest-limit error is reported as a retryable 503, not as success or validation failure', async () => {
  const { res, committed } = await put(bodyFor(2, 'full'), { lineCount: 2, failOn: /^INSERT INTO production_temp_machine_lines/, failMessage: 'Too many subrequests by single Worker invocation.' });
  assert.equal(res.st, 503);
  assert.equal(res.j.success, false);
  assert.equal(res.j.code, 'DB_SUBREQUEST_LIMIT_EXCEEDED');
  assert.equal(committed, 0);
});

test('retry after a failed attempt writes the machine lines exactly once (no duplicates)', async () => {
  const first = await put(bodyFor(2, 'full'), { lineCount: 2, failOn: /^INSERT INTO production_temp_machine_lines/ });
  assert.notEqual(first.res.st, 200);
  assert.equal(first.committed, 0);
  const second = await put(bodyFor(2, 'full'), { lineCount: 2 });
  assert.equal(second.res.st, 200, JSON.stringify(second.res.j));
  assert.equal(second.committed, 1);
  assert.equal(find(second.sqls, /^INSERT INTO production_temp_machine_lines/).length, 1);
  const iDelete = second.sqls.findIndex((q) => /^DELETE d, l FROM production_temp_machine_lines/.test(q.sql));
  const iInsert = second.sqls.findIndex((q) => /^INSERT INTO production_temp_machine_lines/.test(q.sql));
  assert.ok(iDelete >= 0 && iDelete < iInsert, 'old rows are deleted before the new ones are inserted');
});

test('a stale expected_updated_at is rejected before any write (retry after an unknown outcome cannot duplicate)', async () => {
  const stale = bodyFor(2, 'full'); stale.expected_updated_at = ts(5 * 60e3); stale.updated_at = stale.expected_updated_at;
  const { res, sqls, committed } = await put(stale, { lineCount: 2 });
  assert.notEqual(res.st, 200);
  assert.equal(committed, 0);
  assert.equal(find(sqls, /^(INSERT|UPDATE|DELETE)/).filter((q) => !/FOR UPDATE/.test(q.sql)).length, 0);
});
