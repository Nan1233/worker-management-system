'use strict';
// GC machine reports store actual_time = 0 on the parent row; the real time and standard live on the machine
// lines. The pending list used to compute TT định mức = standard x actual_time = 0 (so năng suất = 0%) while the
// detail enriched from the lines. List and detail must now agree, and a line without a standard must be flagged.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function load(lines, parent) {
  const answer = (rawSql) => {
    const sql = String(rawSql).replace(/\s+/g, ' ');
    if (/COUNT\(\*\)/.test(sql)) return [{ total: 1 }];
    if (/production_temp_machine_lines/.test(sql)) return lines.map((l) => ({ ...l }));
    if (/FROM production_temp_defects|FROM production_temp_deductions|production_temp_machine_defects/.test(sql)) return [];
    if (/FROM production_reports_temp pr/.test(sql)) return [{ ...parent }];
    return [];
  };
  const fakeDb = { promise() { return { query: async (sql, p) => [answer(sql, p), []] }; }, query(sql, p, cb) { (typeof p === 'function' ? p : cb)(null, answer(sql), []); }, getConnection() {} };
  for (const name of ['models/productionTempReadModel', 'models/productionTempModelShared']) { try { delete require.cache[require.resolve(path.join(__dirname, '..', name))]; } catch { /* optional */ } }
  const original = Module._load;
  Module._load = function (request, p, ...rest) { if (/config\/db$/.test(request)) return fakeDb; return original.call(this, request, p, ...rest); };
  try { return require(path.join(__dirname, '..', 'models', 'productionTempReadModel.js')); } finally { Module._load = original; }
}

const parent = { id: 900001, process_id: 1, operation_mode: 'MACHINE', status: 'pending', work_date: '2026-10-19', actual_time: 0, total_time: 0, standard_output: 450, tt_ok: 239152, tt_ng: 112, actual_output: 239264 };
const line = (id, hours, out) => ({ id, temp_report_id: 900001, machine_code: `M${id}`, product_code: 'P', machine_time_hours: hours, standard_output: out });

test('pending list derives time and TT định mức from the machine lines, like the detail', async () => {
  const lines = [line(1, 2, 500), line(2, 2, 400), line(3, 1, 300), line(4, 3, 600)];
  const Model = load(lines, parent);
  const list = await Model.getPending(9, { pagination: { page: 1, page_size: 20, offset: 0 } }, true);
  const detail = await Model.getDetail(900001);
  const expected = 2 * 500 + 2 * 400 + 1 * 300 + 3 * 600;
  assert.equal(list.items[0].tt_dinh_muc, expected);
  assert.equal(list.items[0].actual_time, 8);
  assert.equal(detail.tt_dinh_muc, expected);
  assert.equal(detail.actual_time, 8);
  assert.equal(list.items[0].tt_dinh_muc, detail.tt_dinh_muc);
  assert.equal(list.items[0].actual_time, detail.actual_time);
  assert.equal(list.items[0].standard_missing_lines, 0);
});

test('a machine line without a standard is flagged and never borrows another product standard', () => {
  const Model = load([], parent);
  const out = Model.deriveMachineKpiFields({ ...parent, standard_output: 0 }, [line(1, 2, 500), line(2, 2, 0)]);
  assert.equal(out.standard_missing_lines, 1);
  assert.equal(out.tt_dinh_muc, 2 * 500, 'only the line that really has a standard contributes');
});

test('all lines without a standard keep TT định mức at 0 and report every missing line', () => {
  const Model = load([], parent);
  const out = Model.deriveMachineKpiFields({ ...parent, standard_output: 0 }, [line(1, 2, 0), line(2, 3, 0)]);
  assert.equal(out.tt_dinh_muc, 0);
  assert.equal(out.standard_missing_lines, 2);
});

test('reports without machine lines keep their parent values', async () => {
  const manual = { ...parent, operation_mode: 'MANUAL', actual_time: 4, standard_output: 100 };
  const Model = load([], manual);
  const list = await Model.getPending(9, { pagination: { page: 1, page_size: 20, offset: 0 } }, true);
  assert.equal(list.items[0].actual_time, 4);
  assert.equal(list.items[0].standard_output, 100);
  assert.equal(list.items[0].tt_dinh_muc, undefined);
});
