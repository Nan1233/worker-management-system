'use strict';
// Guard for the Cloudflare Workers subrequest budget of POST /api/production-temp/approve.
// On the Free plan a single invocation may issue at most 50 subrequests and the TiDB HTTP driver
// turns every SQL statement (and BEGIN/COMMIT/ROLLBACK) into one subrequest. A 4-machine GC report
// used to need ~70 of them, so COMMIT/ROLLBACK failed and the transaction was left open.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const BACKEND = path.join(__dirname, '..');
const MACHINE_CODES = ['M05', 'M06', 'M07', 'M11'];
const PRODUCTS = ['CGYX-AUTO', 'C5770-AUTO'];

function build({ lines = 4, withEvents = true, failOn = null, existingApproved = false, noEventRows = false, lineStandardOutput = 500, defectsByLine = {}, tamperApproved = false, reportRows = null } = {}) {
  const log = [];
  const calls = [];
  let nextId = 5000;
  const machineCodes = Array.from({ length: lines }, (_, i) => MACHINE_CODES[i] || `M${20 + i}`);
  const productOf = (i) => PRODUCTS[i % PRODUCTS.length];
  const report = {
    id: 900001, worker_id: 7, worker_user_id: 70, process_id: 1, process_code: 'GC', work_date: '2026-10-19', shift: 'DAY',
    operation_mode: 'MACHINE', operation_type: null, machine_no: machineCodes.join(', '), product_name: PRODUCTS.join(', '),
    total_time: 8, actual_time: 8, deduction_time: 0, standard_output: 0, standard_version_id: null, machine_standard_id: null,
    training_percent_snapshot: 100, exclude_kqd_from_tt_snapshot: 0, actual_output: 1000, tt_ok: 990, tt_ng: 10,
    extra_data: '{}', status: 'pending', updated_at: new Date('2026-10-19T10:00:00Z'),
  };
  const tempLines = machineCodes.map((code, i) => ({
    id: 100 + i, temp_report_id: 900001, machine_event_id: withEvents ? 300 + i : null, machine_id: 10 + i, machine_code: code,
    product_code: productOf(i), standard_version_id: 9, machine_standard_id: null, product_standard_id: 1, standard_output: lineStandardOutput,
    standard_source: 'PRODUCT_VERSION_MACHINE_FALLBACK', exclude_kqd_from_tt: 0, machine_time_hours: 2, ok_quantity: 10, ng_quantity: 1,
    maximum_output: 1000, deduction_time_hours: 0, deductions_json: '[]', counted_output: 10, earned_standard_hours: 0.02, defects_json: '[]', sort_order: i + 1,
  }));
  const events = noEventRows ? [] : machineCodes.map((code, i) => ({
    id: 300 + i, process_id: 1, machine_id: 10 + i, machine_code: code, product_code: productOf(i),
    work_date: '2026-10-19', shift: 'DAY', status: 'approved',
  }));
  const machineRows = machineCodes.map((code, i) => ({ id: 10 + i, machine_code: code, gc_work_type: 'CUT', process_code: 'GC' }));

  const answer = (rawSql, params = []) => {
    const sql = String(rawSql).replace(/\s+/g, ' ');
    if (failOn && failOn.test(sql)) throw Object.assign(new Error('boom'), { code: 'ER_FAKE' });
    if (/FROM production_reports WHERE source_temp_id IN/.test(sql) || /SELECT id,source_temp_id,work_date FROM production_reports/.test(sql)) return existingApproved ? [{ id: 1, source_temp_id: 900001 }] : [];
    if (/FROM production_reports_temp t WHERE t.id IN/.test(sql)) return [];
    if (/SELECT DISTINCT temp\.\*/.test(sql)) return reportRows || [report];
    if (/SELECT \* FROM production_reports_temp WHERE id=\? LIMIT 1 FOR UPDATE/.test(sql)) return [report];
    if (/FROM production_temp_machine_lines ml JOIN production_reports_temp r/.test(sql)) return tempLines.map((l) => ({ ...l, process_id: 1, work_date: report.work_date, shift: 'DAY', machine_no: report.machine_no, product_name: report.product_name, process_code: 'GC' }));
    if (/FROM production_temp_machine_lines WHERE temp_report_id=\?/.test(sql)) return tempLines.map((l) => ({ ...l }));
    if (/FROM production_temp_machine_defects/.test(sql)) return tempLines.flatMap((l) => (defectsByLine[l.id] || []).map((d, k) => ({ id: l.id * 10 + k, machine_line_id: l.id, ...d })));
    if (/SELECT process_code FROM processes/.test(sql)) return [{ process_code: 'GC' }];
    if (/FROM machine_production_events WHERE id=\?/.test(sql)) return events.filter((e) => e.id === Number(params[0]));
    if (/FROM machine_production_events/.test(sql)) return events;
    if (/FROM machines m JOIN processes p/.test(sql)) {
      const wantedCodes = params.filter((p) => typeof p === 'string').map((p) => String(p).toUpperCase());
      const wantedIds = params.filter((p) => typeof p === 'number');
      return machineRows.filter((m) => wantedCodes.includes(m.machine_code.toUpperCase()) || wantedIds.includes(m.id));
    }
    if (/FROM product_aliases/.test(sql)) return [];
    if (/FROM product_machine_standards/.test(sql)) return [];
    if (/FROM product_standards ps WHERE/.test(sql)) {
      const code = String(params[1] || '');
      return PRODUCTS.includes(code) ? [{ product_standard_id: 1, product_code: code, encoding_code: null, work_type: 'Cắt', standard_output: 500, exclude_kqd_from_tt: 0 }] : [];
    }
    if (/FROM product_standard_versions/.test(sql)) return [{ id: 9, process_id: 1, product_code: params[1] || 'X', standard_output: 500, exclude_kqd_from_tt: 0, version_no: 1, effective_from: '2026-01-01', effective_to: null, status: 'active' }];
    if (/SELECT \* FROM production_reports WHERE id=\?/.test(sql)) return [{ id: 5001, source_temp_id: 900001, worker_id: 7, process_id: 1, work_date: '2026-10-19', shift: 'DAY', status: 'approved', operation_mode: 'MACHINE', total_time: 8, actual_time: 8, standard_output: 0, actual_output: 1000, tt_ok: 990, tt_ng: 10, extra_data: '{}' }];
    if (/production_report_machine_lines/.test(sql) && /^SELECT/i.test(sql) && !/production_report_machine_defects/.test(sql)) return tempLines.map((l) => ({ ...l, id: l.id + 1000, report_id: 5001, machine_code: tamperApproved ? 'ZZ' : l.machine_code }));
    if (/^INSERT/i.test(sql)) { nextId += 1; return { insertId: nextId, affectedRows: 1 }; }
    return [];
  };
  const record = (s, p) => { log.push(String(s).replace(/\s+/g, ' ').trim().slice(0, 140)); calls.push({ sql: String(s).replace(/\s+/g, ' ').trim(), params: p }); };
  const conn = {
    supportsBeginIsolation: true,
    query(sql, p, cb) {
      if (typeof p === 'function') { cb = p; p = []; }
      record(sql, p);
      let r; let err = null;
      try { r = answer(sql, p || []); } catch (e) { err = e; }
      if (!cb) return err ? Promise.reject(err) : Promise.resolve([r, []]);
      setImmediate(() => cb(err, r, []));
    },
    beginTransaction(a, b) { const cb = typeof a === 'function' ? a : b; record('BEGIN'); setImmediate(() => cb(null)); },
    commit(cb) { record('COMMIT'); setImmediate(() => cb(null)); },
    rollback(cb) { record('ROLLBACK'); setImmediate(() => cb(null)); },
    release() {},
  };
  const fakeDb = {
    getConnection(cb) { setImmediate(() => cb(null, conn)); },
    query(sql, p, cb) { if (typeof p === 'function') { cb = p; p = []; } record(sql); let r; let err = null; try { r = answer(sql, p || []); } catch (e) { err = e; } setImmediate(() => cb && cb(err, r, [])); },
    promise() { return { query: async (sql, p) => { record(sql, p); return [answer(sql, p || []), []]; } }; },
  };
  const names = ['models/productionTempReviewModel', 'models/productionTempApprovalModel', 'models/productionTempModelShared', 'services/auditService',
    'services/standardResolutionService', 'services/machineProductionEventService', 'services/approvedVersionSnapshotService', 'services/factoryMachineRuleService'];
  for (const name of names) { try { delete require.cache[require.resolve(path.join(BACKEND, name))]; } catch { /* optional */ } }
  const original = Module._load;
  Module._load = function (request, parent, ...rest) { if (/config\/db$/.test(request)) return fakeDb; return original.call(this, request, parent, ...rest); };
  let Review;
  try { Review = require(path.join(BACKEND, 'models/productionTempReviewModel.js')); } finally { Module._load = original; }
  return { Review, log, calls };
}

async function approve(opts) {
  const ctx = build(opts);
  const logOrig = console.log; const warnOrig = console.warn; const errOrig = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  try {
    const result = await ctx.Review.approveSelected([{ id: 900001 }], 9, false);
    return { ...ctx, result };
  } catch (error) {
    return { ...ctx, error };
  } finally { console.log = logOrig; console.warn = warnOrig; console.error = errOrig; }
}

// Statements issued by the controller before the model (permission lookup, scope lookup, process scope)
// are not part of this harness; keep a fixed allowance for them.
const CONTROLLER_ALLOWANCE = 8;
const WORKER_FREE_LIMIT = 50;

test('approve 1 machine report succeeds', async () => {
  const { result, error, log } = await approve({ lines: 1 });
  assert.ifError(error);
  assert.equal(result.count, 1);
  assert.ok(log.some((s) => /^INSERT INTO production_reports /.test(s)));
  assert.equal(log.at(-1) === 'COMMIT' || log.includes('COMMIT'), true);
});

test('approve 4 machine report succeeds with every machine line copied', async () => {
  const { result, error, log } = await approve({ lines: 4 });
  assert.ifError(error);
  assert.equal(result.approved_ids.length, 1);
  assert.equal(log.filter((s) => /^INSERT INTO production_report_machine_lines/.test(s)).length >= 1, true);
  assert.equal(log.filter((s) => s === 'COMMIT').length, 1);
});

test('4-machine approval stays inside the Free-plan subrequest limit with headroom', async () => {
  const { error, log } = await approve({ lines: 4 });
  assert.ifError(error);
  assert.ok(log.length + CONTROLLER_ALLOWANCE <= WORKER_FREE_LIMIT - 5, `model statements=${log.length}`);
});

test('subrequests grow by at most 2 per extra machine line', async () => {
  const one = await approve({ lines: 1 });
  const four = await approve({ lines: 4 });
  const eight = await approve({ lines: 8 });
  assert.ifError(one.error); assert.ifError(four.error); assert.ifError(eight.error);
  assert.ok((eight.log.length - four.log.length) / 4 <= 2, `per-line growth ${(eight.log.length - four.log.length) / 4}`);
  assert.ok((four.log.length - one.log.length) / 3 <= 2, `per-line growth ${(four.log.length - one.log.length) / 3}`);
  assert.ok(eight.log.length + CONTROLLER_ALLOWANCE <= WORKER_FREE_LIMIT, `8 lines used ${eight.log.length}`);
});

test('shared GC machine without an approved production event is rejected and nothing is committed', async () => {
  const { error, log } = await approve({ lines: 4, withEvents: false, noEventRows: true });
  assert.ok(error, 'must be rejected');
  assert.equal(error.code, 'MACHINE_EVENT_REQUIRED');
  assert.equal(log.filter((s) => s === 'COMMIT').length, 0);
  assert.equal(log.filter((s) => /^INSERT INTO production_reports /.test(s)).length, 0);
  assert.equal(log.filter((s) => s === 'ROLLBACK').length, 1);
});

test('a saved standard that differs from the resolved standard is still rejected', async () => {
  const { error, log } = await approve({ lines: 4, lineStandardOutput: 123 });
  assert.ok(error, 'must be rejected');
  assert.equal(error.code, 'STANDARD_SNAPSHOT_MISMATCH');
  assert.equal(log.filter((s) => s === 'COMMIT').length, 0);
  assert.equal(log.filter((s) => /^INSERT INTO production_reports /.test(s)).length, 0);
});

test('a report that is no longer pending is rejected as stale (no duplicate approval on resubmit)', async () => {
  const { error, log } = await approve({ lines: 4, reportRows: [] });
  assert.ok(error);
  assert.equal(error.code, 'APPROVAL_SELECTION_STALE');
  assert.equal(log.filter((s) => /^INSERT INTO production_reports /.test(s)).length, 0);
  assert.equal(log.filter((s) => s === 'COMMIT').length, 0);
});

test('a failure inside the transaction rolls back and nothing is committed', async () => {
  const { error, log } = await approve({ lines: 4, failOn: /^INSERT INTO production_report_snapshots/ });
  assert.ok(error);
  assert.equal(log.filter((s) => s === 'COMMIT').length, 0);
  assert.equal(log.filter((s) => s === 'ROLLBACK').length, 1);
});

test('machine lines are copied with one multi-row INSERT carrying every line in order', async () => {
  const { error, calls } = await approve({ lines: 4 });
  assert.ifError(error);
  const inserts = calls.filter((c) => /^INSERT INTO production_report_machine_lines/.test(c.sql));
  assert.equal(inserts.length, 1);
  const params = inserts[0].params;
  assert.equal(params.length, 4 * 22);
  const codes = [0, 1, 2, 3].map((i) => params[i * 22 + 3]);
  assert.deepEqual(codes, ['M05', 'M06', 'M07', 'M11']);
  assert.deepEqual([0, 1, 2, 3].map((i) => params[i * 22 + 7]), ['CGYX-AUTO', 'C5770-AUTO', 'CGYX-AUTO', 'C5770-AUTO']);
});

test('machine defects are attached to the approved line that matches their temp line', async () => {
  const defectsByLine = {
    101: [{ defect_type_id: 1, defect_code: 'A', defect_name: 'A', quantity: 3 }],
    103: [{ defect_type_id: 2, defect_code: 'B', defect_name: 'B', quantity: 5 }, { defect_type_id: 3, defect_code: 'C', defect_name: 'C', quantity: 7 }],
  };
  const { error, calls } = await approve({ lines: 4, defectsByLine });
  assert.ifError(error);
  const insert = calls.find((c) => /^INSERT INTO production_report_machine_defects/.test(c.sql));
  assert.ok(insert);
  const p = insert.params; // groups of 5: machine_line_id, defect_type_id, code, name, quantity
  assert.deepEqual([p[0], p[1], p[4]], [1101, 1, 3]);
  assert.deepEqual([p[5], p[6], p[9]], [1103, 2, 5]);
  assert.deepEqual([p[10], p[11], p[14]], [1103, 3, 7]);
});

test('copied lines that do not match the source fail closed (rollback, no commit)', async () => {
  const { error, log } = await approve({ lines: 4, tamperApproved: true });
  assert.ok(error);
  assert.equal(error.code, 'APPROVED_MACHINE_LINES_COPY_MISMATCH');
  assert.equal(log.filter((s) => s === 'COMMIT').length, 0);
  assert.equal(log.filter((s) => s === 'ROLLBACK').length, 1);
});

test('lines without a linked event are linked with one candidate SELECT and one UPDATE for the whole batch', async () => {
  const { error, calls } = await approve({ lines: 4, withEvents: false });
  assert.ifError(error);
  const preTransaction = calls.slice(0, calls.findIndex((c) => c.sql === 'BEGIN'));
  assert.equal(preTransaction.filter((c) => /FROM machine_production_events/.test(c.sql)).length, 1);
  const updates = preTransaction.filter((c) => /^UPDATE production_temp_machine_lines\s+SET machine_id=COALESCE\(CASE id/.test(c.sql));
  assert.equal(updates.length, 1);
  assert.match(updates[0].sql, /WHERE id IN \(\?,\?,\?,\?\) AND machine_event_id IS NULL/);
  // event ids (4 x [lineId, eventId]) are the last CASE block before the IN list
  const p = updates[0].params;
  assert.deepEqual(p.slice(-4), [100, 101, 102, 103]);
});
