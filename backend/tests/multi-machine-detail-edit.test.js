'use strict';
// Multi-machine report visibility: pending detail, approved detail and edit-form source data must carry
// every machine line with its own deduction/time/defect data. Runs against a fake DB (no real database).
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const BACKEND = path.join(__dirname, '..');
const lineRow = (i, over = {}) => ({
  id: 100 + i, temp_report_id: 900001, report_id: 5001, machine_event_id: null, machine_id: 10 + i, machine_code: `M${i + 1}`, product_code: `P${i + 1}`,
  product_standard_id: 1, standard_version_id: 9, machine_standard_id: null, machine_time_hours: 3, deduction_time_hours: 1,
  deductions_json: JSON.stringify([{ deduction_type_id: 5, deduction_name: 'Hỏng máy', hours: 1 }]),
  standard_output: 500, standard_time_seconds: 7.2, standard_source: 'PRODUCT_VERSION', exclude_kqd_from_tt: 0,
  ok_quantity: 10 * (i + 1), ng_quantity: i + 1, maximum_output: 1500, counted_output: 10, earned_standard_hours: 0.1,
  defects_json: JSON.stringify([{ defect_type_id: 11, defect_name: 'Vỡ', quantity: i + 1 }]), sort_order: i + 1, ...over,
});

function load(n, { failMachineLines = false, parentDefects = [] } = {}) {
  const lines = Array.from({ length: n }, (_, i) => lineRow(i));
  const temp = { id: 900001, worker_id: 7, process_id: 1, process_code: 'GC', status: 'pending', work_date: '2026-10-23', tt_ok: 0, tt_ng: 0, actual_output: 0, operation_mode: 'MACHINE', created_at: '2026-10-23 01:00:00', updated_at: '2026-10-23 01:00:00' };
  const approved = { id: 5001, worker_id: 7, process_id: 1, process_code: 'GC', status: 'approved', work_date: '2026-10-23', tt_ok: 0, tt_ng: 0, actual_output: 0, operation_mode: 'MACHINE', created_at: '2026-10-23 01:00:00', updated_at: '2026-10-23 01:00:00' };
  // Mimic a real DB: only the selected columns of production_report_machine_lines come back.
  const project = (sql, rows) => {
    const m = /SELECT (.*?) FROM production_report_machine_lines ml/s.exec(sql);
    if (!m || /ml\.\*/.test(m[1])) return rows;
    const cols = m[1].split(',').map((c) => c.trim().replace(/^ml\./, ''));
    return rows.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])));
  };
  const answer = (rawSql) => {
    const sql = String(rawSql).replace(/\s+/g, ' ');
    if (/FROM production_reports_temp pr LEFT JOIN workers/.test(sql)) return [temp];
    if (/FROM production_temp_defects/.test(sql)) return parentDefects;
    if (/FROM production_temp_machine_lines/.test(sql)) return lines.map((l) => ({ ...l }));
    if (/FROM production_reports pr LEFT JOIN workers.*status='approved'/.test(sql)) return [approved];
    if (/SELECT id,worker_id,process_id FROM production_reports WHERE id/.test(sql)) return [approved];
    if (/SELECT pr\.\*,p\.process_name/.test(sql)) return [approved];
    if (/FROM production_report_machine_lines/.test(sql)) { if (failMachineLines) throw new Error('boom'); return project(sql, lines.map((l) => ({ ...l }))); }
    return [];
  };
  const db = {
    query(s, p, cb) { if (typeof p === 'function') { cb = p; p = []; } let r; try { r = answer(s); } catch (e) { return cb && setImmediate(() => cb(e)); } setImmediate(() => cb && cb(null, r, [])); },
    getConnection(cb) { cb(new Error('no tx')); },
    promise() { return { query: async (s) => [answer(s), []] }; },
  };
  const original = Module._load;
  Module._load = function (request, ...rest) { if (/config\/db$/.test(request)) return db; return original.call(this, request, ...rest); };
  try {
    for (const k of Object.keys(require.cache)) if (/(models[\\/]productionTemp|controllers[\\/]productionController)/.test(k)) delete require.cache[k];
    return {
      Read: require(path.join(BACKEND, 'models/productionTempReadModel.js')),
      Prod: require(path.join(BACKEND, 'controllers/productionController.js')),
    };
  } finally { Module._load = original; }
}

const quiet = async (fn) => { const o = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {}; try { return await fn(); } finally { [console.log, console.warn, console.error] = o; } };
async function approvedDetail(n, opts) {
  const { Prod } = load(n, opts);
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await quiet(() => Prod.getReportById({ params: { id: '5001' }, user: { id: 70, role: 'worker', worker_id: 7 } }, res));
  return res;
}

for (const n of [1, 2, 4, 6]) {
  test(`pending detail returns all ${n} machine lines with per-line data`, async () => {
    const { Read } = load(n);
    const d = await quiet(() => Read.getDetail(900001));
    assert.equal(d.machine_lines.length, n);
    assert.deepEqual(d.machine_lines.map((l) => l.machine_code), Array.from({ length: n }, (_, i) => `M${i + 1}`));
    d.machine_lines.forEach((l, i) => {
      assert.equal(Number(l.ok_quantity), 10 * (i + 1));
      assert.equal(Number(l.ng_quantity), i + 1);
      assert.equal(l.defects.length, 1);
      assert.equal(Number(l.defects[0].quantity), i + 1);
    });
  });

  test(`approved detail returns all ${n} machine lines including deduction time per line`, async () => {
    const res = await approvedDetail(n);
    assert.equal(res.statusCode, 200);
    const lines = res.body.data.machine_lines;
    assert.equal(lines.length, n);
    lines.forEach((l) => {
      assert.equal(Number(l.deduction_time_hours), 1, `line ${l.machine_code} lost deduction_time_hours`);
      assert.ok(l.deductions_json, `line ${l.machine_code} lost deductions_json`);
      assert.equal(Number(l.machine_time_hours), 3);
    });
  });
}

test('worker_defects stays empty when the worker declared none, machine defects stay on their lines', async () => {
  const { Read } = load(2);
  const d = await quiet(() => Read.getDetail(900001));
  assert.deepEqual(d.worker_defects, []);
  assert.deepEqual(d.machine_lines.map((l) => l.defects.map((x) => Number(x.quantity))), [[1], [2]]);
});

test('worker_defects contains only parent-table rows, never machine-line defects', async () => {
  const parent = [{ id: 1, defect_type_id: 11, defect_code: 'X', defect_name: 'Vỡ', quantity: 4 }, { id: 2, defect_type_id: 12, defect_code: 'Y', defect_name: 'Xước', quantity: 0 }];
  const { Read } = load(2, { parentDefects: parent });
  const d = await quiet(() => Read.getDetail(900001));
  assert.deepEqual(d.worker_defects.map((x) => [x.defect_type_id, x.quantity]), [[11, 4]]);
});

test('approved detail reports a machine-line load failure instead of silently showing zero machines', async () => {
  const res = await approvedDetail(3, { failMachineLines: true });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.machine_lines.length, 0);
  assert.equal(res.body.data.machine_lines_load_failed, true);
});
