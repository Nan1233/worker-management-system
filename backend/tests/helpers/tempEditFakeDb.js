'use strict';
// Shared fake TiDB for the pending-report edit tests: answers by SQL pattern, records every statement (each one is a
// Cloudflare Worker subrequest) and exposes switches to inject failures. insertId is never available (as on the Worker).
process.env.KTC_CLOUDFLARE_WORKER = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-fake-db';
const Module = require('node:module');
const path = require('node:path');

const BACKEND = path.join(__dirname, '..', '..');
const state = { sqls: [], failOn: null, failRollback: false, lineCount: 2, committed: 0, createdAgoMs: 60e3, managerProcessIds: [1], workerAssigned: true, processCode: 'GC', machineType: 'CUT', user: { id: 70, username: 'w7', role: 'worker', status: 'active', worker_id: 7, worker_status: 'active', database_name: 'ktc_test' } };
const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const ts = (offsetMs) => new Date(Date.now() - offsetMs).toISOString().slice(0, 19).replace('T', ' ');
const UPD = ts(60e3);

const storedLines = (n) => Array.from({ length: n }, (_, i) => ({
  id: 100 + i, temp_report_id: 900001, machine_id: 10 + i, machine_code: `M0${5 + i}`, product_code: `P${i + 1}`, product_standard_id: 1,
  standard_version_id: 9, machine_time_hours: 3, deduction_time_hours: 1, deductions_json: '[]', standard_output: 500, standard_source: 'PRODUCT_VERSION',
  exclude_kqd_from_tt: 0, ok_quantity: 100, ng_quantity: 2, maximum_output: 1500, counted_output: 102, earned_standard_hours: 0.2,
  defects_json: JSON.stringify([{ defect_type_id: 11, defect_code: 'X', defect_name: 'Vỡ', quantity: 2 }]), sort_order: i + 1,
}));

const temp = () => ({
  id: 900001, worker_id: 7, process_id: 1, process_code: 'GC', status: 'pending', work_date: today, shift: 'A', operation_mode: 'MACHINE',
  machine_no: Array.from({ length: state.lineCount }, (_, i) => `M0${5 + i}`).join(', '), product_name: Array.from({ length: state.lineCount }, (_, i) => `P${i + 1}`).join(', '),
  actual_time: 0, total_time: 0, deduction_time: 0, standard_output: 0, tt_ok: 100 * state.lineCount, tt_ng: 2 * state.lineCount, actual_output: 0,
  training_percent_snapshot: 100, exclude_kqd_from_tt_snapshot: 0, extra_data: '{}', created_at: ts(state.createdAgoMs), updated_at: UPD,
});

const answer = (raw, p = []) => {
  const s = String(raw).replace(/\s+/g, ' ').trim();
  state.sqls.push({ sql: s, params: p });
  if (state.failOn && state.failOn.test(s)) throw Object.assign(new Error(state.failMessage || 'boom'), { code: 'ER_FAKE' });
  const n = state.lineCount;
  if (/FROM users u LEFT JOIN workers w/.test(s)) return [{ ...state.user }];
  if (/information_schema\.tables/.test(s)) return [{ total: 2 }];
  if (/FROM (role|user)_permission_overrides/.test(s)) return [];
  if (/FROM manager_processes WHERE manager_id/.test(s)) return state.managerProcessIds.map((process_id) => ({ process_id }));
  if (/FROM production_reports_temp WHERE id=/.test(s)) return [temp()];
  if (/MAX\(version_no\)/.test(s)) return [{ next_version: 3 }];
  if (/FROM production_reports_temp pr LEFT JOIN workers/.test(s) || /SELECT pr\.\* FROM production_reports_temp pr/.test(s) || /FROM production_reports_temp prt/.test(s)) {
    return [{ ...temp(), worker_user_id: 70, edit_elapsed_seconds: Math.round(state.createdAgoMs / 1000), rejection_elapsed_seconds: Math.round(state.createdAgoMs / 1000) }];
  }
  if (/FROM production_temp_machine_lines/.test(s)) return storedLines(n);
  if (/FROM production_temp_defects|FROM production_temp_deductions|FROM production_temp_machine_defects/.test(s)) return [];
  if (/FROM worker_processes/.test(s)) return state.workerAssigned ? [{ 1: 1 }] : [];
  if (/FROM machines/.test(s)) {
    const all = Array.from({ length: n }, (_, i) => ({ id: 10 + i, machine_code: `M0${5 + i}`, gc_work_type: state.machineType, is_automatic: 1, process_code: 'GC' }));
    const codes = p.filter((x) => typeof x === 'string').map((x) => x.toUpperCase());
    const ids = p.filter((x) => typeof x === 'number' && x > 5);
    const f = all.filter((m) => codes.includes(m.machine_code) || ids.includes(m.id));
    return /m\.process_id=\?\s*AND m\.status='active'\s*$/.test(s) || (!codes.length && !ids.length) ? all : f;
  }
  if (/FROM defect_types/.test(s)) return [{ id: 11, defect_code: 'X', defect_name: 'Vỡ', status: 'active' }];
  if (/FROM deduction_types/.test(s)) return [];
  if (/FROM processes/.test(s)) return [{ process_code: 'GC', process_name: 'Gia công', id: 1 }];
  // batched lookups from standardResolver.warmUp(): one row per requested product code
  if (/FROM product_standards ps WHERE process_id=\? AND TRIM\(product_code\) IN/.test(s)) return p.slice(1).map((code, i) => ({ product_standard_id: 100 + i, product_code: code, encoding_code: null, standard_output: 500, exclude_kqd_from_tt: 0, work_type: 'Cắt', status: 'active' }));
  if (/FROM product_standard_versions WHERE process_id=\? AND TRIM\(product_code\) IN/.test(s)) return p.slice(1, -2).map((code, i) => ({ id: 9 + i, process_id: 1, product_code: code, standard_output: 500, exclude_kqd_from_tt: 0, version_no: 1, effective_from: '2020-01-01', effective_to: null, status: 'active' }));
  if (/FROM product_standards/.test(s)) return [{ id: 1, product_code: p[1] || 'P1', encoding_code: null, standard_output: 500, exclude_kqd_from_tt: 0, process_code: 'GC', product_standard_id: 1, work_type: 'Cắt', has_machine_specific_standard: 0 }];
  if (/FROM product_standard_versions/.test(s)) return [{ id: 9, process_id: 1, product_code: 'P1', standard_output: 500, exclude_kqd_from_tt: 0, version_no: 1, effective_from: '2020-01-01' }];
  if (/LAST_INSERT_ID/.test(s)) return [{ insertId: 55 }];
  if (/SELECT SUM|COUNT\(/.test(s)) return [{ counted_hours: 0, total: 0, cnt: 0 }];
  if (/^INSERT/i.test(s)) return { insertId: 0, affectedRows: 1 };
  return [];
};
const run = (fn) => (sql, p, cb) => {
  if (typeof p === 'function') { cb = p; p = []; }
  let r; let e = null;
  try { r = fn(sql, p || []); } catch (x) { e = x; }
  if (!cb) return e ? Promise.reject(e) : Promise.resolve([r, []]);
  setImmediate(() => cb(e, r, []));
  return undefined;
};
const conn = {
  supportsBeginIsolation: true,
  query: run(answer),
  beginTransaction(a, b) { state.sqls.push({ sql: 'BEGIN', params: [] }); (typeof a === 'function' ? a : b)(null); },
  commit(cb) { state.sqls.push({ sql: 'COMMIT', params: [] }); state.committed += 1; cb(null); },
  rollback(cb) { state.sqls.push({ sql: 'ROLLBACK', params: [] }); cb(state.failRollback ? new Error('Too many subrequests by single Worker invocation') : null); },
  release() {},
};
const db = {
  query: run(answer),
  getConnection(cb) { setImmediate(() => cb(null, conn)); },
  promise() { return { query: async (s, p) => [answer(s, p || []), []], getConnection: async () => ({ ...conn, query: async (s, p) => [answer(s, p || []), []], beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {} }) }; },
};
const original = Module._load;
Module._load = function (request, ...rest) {
  if (/config\/db$/.test(request)) return db;
  return original.call(this, request, ...rest);
};
// Resolver/permission caches live in module scope. A cold Worker isolate has none of them, so every measurement
// starts from freshly loaded modules (worst case for the subrequest budget).
const freshRequire = (rel) => {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(BACKEND + path.sep) && !key.includes(`${path.sep}node_modules${path.sep}`) && !key.includes(`${path.sep}tests${path.sep}`)) delete require.cache[key];
  }
  return require(path.join(BACKEND, rel));
};


module.exports = { BACKEND, state, today, ts, UPD, freshRequire, answer };
