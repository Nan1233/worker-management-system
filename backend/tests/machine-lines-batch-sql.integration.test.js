'use strict';
// Runs the real batch SQL (multi-row INSERT, INSERT ... SELECT mapped by sort_order, multi-table DELETE, report_versions
// INSERT ... SELECT MAX+1) against a REAL MySQL-compatible server. Opt-in: set KTC_IT_MYSQL_SOCKET (and optionally
// KTC_IT_MYSQL_USER / KTC_IT_MYSQL_PASSWORD / KTC_IT_MYSQL_DATABASE) to a scratch database that already contains
// production_temp_machine_lines + production_temp_machine_defects (database/KTC_FULL_DATABASE_CANONICAL_*.sql) and
// report_versions. Skipped otherwise. A MariaDB/MySQL pass is NOT proof for TiDB - run the same statements on TEST TiDB too.
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const SOCKET = process.env.KTC_IT_MYSQL_SOCKET;
const skip = SOCKET ? false : 'KTC_IT_MYSQL_SOCKET not set (opt-in real-SQL test)';

test('machine lines + defects: batch write, replace and retry against a real SQL engine', { skip }, async () => {
  const mysql = require('mysql2');
  const pool = mysql.createPool({ socketPath: SOCKET, user: process.env.KTC_IT_MYSQL_USER || 'k', password: process.env.KTC_IT_MYSQL_PASSWORD || 'k', database: process.env.KTC_IT_MYSQL_DATABASE || 'ktc_t', connectionLimit: 2 });
  const original = Module._load;
  Module._load = function (request, ...rest) { return /config\/db$/.test(request) ? pool : original.call(this, request, ...rest); };
  const create = require(path.join(__dirname, '..', 'models', 'productionTempCreateModel.js'));
  const q = (sql, p = []) => new Promise((res, rej) => pool.query(sql, p, (e, r) => (e ? rej(e) : res(r))));
  const D = (id, code, quantity) => ({ defect_type_id: id, defect_code: code, defect_name: `N${code}`, quantity });
  const L = (i, defects) => ({ machine_code: `M0${5 + i}`, product_code: `P${i + 1}`, machine_id: 10 + i, product_standard_id: 1, standard_version_id: 9, machine_standard_id: null, machine_time_hours: 2 + i, standard_output: 500, standard_source: 'PRODUCT_VERSION', exclude_kqd_from_tt: 0, ok_quantity: 100 + i, ng_quantity: defects.reduce((s, d) => s + d.quantity, 0), maximum_output: 1000, deduction_time_hours: 0.5 * i, deductions: [], counted_output: 100, earned_standard_hours: 0.2, defects });
  const ID = 987001;
  const conn = await new Promise((res, rej) => pool.getConnection((e, c) => (e ? rej(e) : res(c))));
  const dump = () => q(`SELECT l.sort_order, l.machine_code, l.ok_quantity ok, l.ng_quantity ng, d.defect_code, d.quantity FROM production_temp_machine_lines l LEFT JOIN production_temp_machine_defects d ON d.machine_line_id = l.id WHERE l.temp_report_id = ? ORDER BY l.sort_order, d.defect_code`, [ID]);
  try {
    await q('DELETE d, l FROM production_temp_machine_lines l LEFT JOIN production_temp_machine_defects d ON d.machine_line_id = l.id WHERE l.temp_report_id = ?', [ID]);
    await create.replaceMachineLines(ID, [L(0, [D(1, 'A', 2), D(2, 'B', 3)]), L(1, [D(1, 'A', 4)]), L(2, []), L(3, [D(3, 'C', 1), D(1, 'A', 1)])], conn, { isNewReport: true });
    let rows = await dump();
    assert.deepEqual(rows.map((r) => [r.sort_order, r.machine_code, r.defect_code, r.quantity]), [[1, 'M05', 'A', 2], [1, 'M05', 'B', 3], [2, 'M06', 'A', 4], [3, 'M07', null, null], [4, 'M08', 'A', 1], [4, 'M08', 'C', 1]]);
    assert.deepEqual([...new Set(rows.map((r) => `${r.machine_code}:${r.ok}:${r.ng}`))], ['M05:100:5', 'M06:101:4', 'M07:102:0', 'M08:103:2']);
    const old = await q('SELECT * FROM production_temp_machine_lines WHERE temp_report_id = ? ORDER BY sort_order, id', [ID]);
    await create.replaceMachineLines(ID, [L(0, [D(1, 'A', 9)]), L(1, [])], conn, { oldLines: old, preserveEventLinks: true });
    await create.replaceMachineLines(ID, [L(0, [D(1, 'A', 9)]), L(1, [])], conn, {}); // retry: same result, no duplicates
    rows = await dump();
    assert.deepEqual(rows.map((r) => [r.sort_order, r.machine_code, r.defect_code, r.quantity]), [[1, 'M05', 'A', 9], [2, 'M06', null, null]]);
    const orphans = await q('SELECT COUNT(*) n FROM production_temp_machine_defects d LEFT JOIN production_temp_machine_lines l ON l.id = d.machine_line_id WHERE l.id IS NULL');
    assert.equal(orphans[0].n, 0);
  } finally {
    await q('DELETE d, l FROM production_temp_machine_lines l LEFT JOIN production_temp_machine_defects d ON d.machine_line_id = l.id WHERE l.temp_report_id = ?', [ID]);
    conn.release(); pool.end(); Module._load = original;
  }
});
