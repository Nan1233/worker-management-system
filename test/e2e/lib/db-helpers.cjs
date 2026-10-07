'use strict';

// Read-back helpers for FE/API -> BE -> DB verification.
//
// Only ever connects after lib/guard.cjs approved the database. Rows created by a
// run carry its run id in `note` and are removed afterwards unless
// KTC_E2E_KEEP_DATA=1 (same convention as scripts/zero-cost/critical-e2e.cjs).

const path = require('node:path');
const crypto = require('node:crypto');
const guard = require('./guard.cjs');
const config = require('./config.cjs');

const BACKEND_DIR = path.join(config.ROOT, 'backend');

async function connect() {
  const verdict = await guard.checkDatabase();
  if (!verdict.ok) throw new Error(`E2E REFUSED: ${verdict.reason}`);
  const mysql = require(path.join(BACKEND_DIR, 'node_modules', 'mysql2', 'promise'));
  const connection = await mysql.createConnection({ ...verdict.config, connectTimeout: 10_000, dateStrings: true });
  const [rows] = await connection.query('SELECT DATABASE() AS name');
  if (rows?.[0]?.name !== verdict.config.database) {
    await connection.end();
    throw new Error(`E2E REFUSED: connected to ${rows?.[0]?.name}, expected ${verdict.config.database}`);
  }
  return connection;
}

const newRunId = (tag = 'E2E') => `KTC_${tag}_${new Date().toISOString().replace(/[-:.TZ]/g, '')}_${crypto.randomBytes(3).toString('hex')}`;

const localDate = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function gcMasterData(db, processId) {
  const [deductions] = await db.query(
    `SELECT id, deduction_code, deduction_name FROM deduction_types WHERE process_id=? AND LOWER(status)='active' ORDER BY sort_order, id`, [processId]);
  const [defects] = await db.query(
    `SELECT id, defect_code, defect_name FROM defect_types WHERE process_id=? AND LOWER(status)='active' ORDER BY sort_order, id`, [processId]);
  return { deductions, defects };
}

/**
 * The GC scenario used by the DB and web layers: two machines whose numbers do
 * not overlap, so any copy/merge between lines is visible.
 *   Machine A: 4.5 h, 0.5 h deduction, OK 100, NG 5
 *   Machine B: 6 h,   1.0 h deduction (0.75 + 0.25), OK 240, NG 12
 */
function gcTwoMachineScenario({ machines, product, deductionTypes, defectTypes }) {
  if (deductionTypes.length < 3) throw new Error(`GC needs >= 3 active deduction types, found ${deductionTypes.length}`);
  if (defectTypes.length < 3) throw new Error(`GC needs >= 3 active defect types, found ${defectTypes.length}`);
  const ded = (type, hours) => ({ deduction_type_id: Number(type.id), deduction_code: type.deduction_code, deduction_name: type.deduction_name, hours });
  const def = (type, quantity) => ({ defect_type_id: Number(type.id), defect_code: type.defect_code, defect_name: type.defect_name, quantity });
  return [
    {
      machine_code: machines[0], product_code: product, machine_time_hours: 4.5,
      deductions: [ded(deductionTypes[0], 0.5)], deduction_time_hours: 0.5, adjustment_minutes: 30,
      ok_quantity: 100, ng_quantity: 5, defects: [def(defectTypes[0], 5)]
    },
    {
      machine_code: machines[1], product_code: product, machine_time_hours: 6,
      deductions: [ded(deductionTypes[1], 0.75), ded(deductionTypes[2], 0.25)], deduction_time_hours: 1, adjustment_minutes: 60,
      ok_quantity: 240, ng_quantity: 12, defects: [def(defectTypes[1], 7), def(defectTypes[2], 5)]
    }
  ];
}

/** API payload in the shape frontend/src/pages/worker/processReportSubmission.ts sends for GC machine lines. */
function gcPayload({ processId, lines, runId, workDate = localDate(0), shift = 'A' }) {
  return {
    process_id: processId, work_date: workDate, shift,
    machine_no: lines.map((l) => l.machine_code).join(', '),
    product_name: [...new Set(lines.map((l) => l.product_code))].join(', '),
    operation_type: 'CUT', operation_mode: 'MACHINE',
    total_time: 0, actual_time: 0, deduction_time: 0, standard_output: 0,
    actual_output: lines.reduce((s, l) => s + l.ok_quantity, 0),
    tt_ok: lines.reduce((s, l) => s + l.ok_quantity, 0),
    tt_ng: lines.reduce((s, l) => s + l.ng_quantity, 0),
    note: runId, extra_data: { execution_method: 'AUTO' },
    defects: [], deductions: [],
    machine_lines: lines.map((l) => ({ ...l, adjustment_count: 0, standard_time_seconds: null, standard_source: null })),
    client_request_id: crypto.randomUUID()
  };
}

const parseJson = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  try { return JSON.parse(value); } catch { return []; }
};

async function tempReportByNote(db, runId) {
  const [rows] = await db.query(`SELECT * FROM production_reports_temp WHERE note LIKE ? ORDER BY id`, [`%${runId}%`]);
  return rows;
}

async function tempMachineLines(db, tempReportId) {
  const [lines] = await db.query(`SELECT * FROM production_temp_machine_lines WHERE temp_report_id=? ORDER BY sort_order, id`, [tempReportId]);
  const ids = lines.map((l) => l.id);
  const [defects] = ids.length
    ? await db.query(`SELECT * FROM production_temp_machine_defects WHERE machine_line_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids)
    : [[]];
  return lines.map((line) => ({ ...line, deductions: parseJson(line.deductions_json), defectsJson: parseJson(line.defects_json), defectRows: defects.filter((d) => d.machine_line_id === line.id) }));
}

async function approvedReportForTemp(db, tempReportId) {
  const [rows] = await db.query(`SELECT * FROM production_reports WHERE source_temp_id=? ORDER BY id`, [tempReportId]);
  return rows;
}

async function approvedMachineLines(db, reportId) {
  const [lines] = await db.query(`SELECT * FROM production_report_machine_lines WHERE report_id=? ORDER BY sort_order, id`, [reportId]);
  const ids = lines.map((l) => l.id);
  const [defects] = ids.length
    ? await db.query(`SELECT * FROM production_report_machine_defects WHERE machine_line_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids)
    : [[]];
  return lines.map((line) => ({ ...line, deductions: parseJson(line.deductions_json), defectsJson: parseJson(line.defects_json), defectRows: defects.filter((d) => d.machine_line_id === line.id) }));
}

async function tableExists(db, table) {
  const [rows] = await db.query(`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?`, [table]);
  return Number(rows?.[0]?.n || 0) > 0;
}

/** Remove everything a run created (temp + approved reports, lines, defects). */
async function cleanupRun(db, runId) {
  if (process.env.KTC_E2E_KEEP_DATA === '1') return { kept: true };
  const like = `%${runId}%`;
  const [temps] = await db.query(`SELECT id FROM production_reports_temp WHERE note LIKE ?`, [like]);
  const [approved] = await db.query(`SELECT id FROM production_reports WHERE note LIKE ? OR source_temp_id IN (SELECT id FROM production_reports_temp WHERE note LIKE ?)`, [like, like]);
  const tempIds = temps.map((r) => r.id);
  const reportIds = approved.map((r) => r.id);
  const inList = (ids) => ids.map(() => '?').join(',');
  const run = async (table, sql, params) => { if (params.length && await tableExists(db, table)) await db.query(sql, params); };
  if (tempIds.length) {
    await run('production_temp_machine_defects', `DELETE FROM production_temp_machine_defects WHERE machine_line_id IN (SELECT id FROM production_temp_machine_lines WHERE temp_report_id IN (${inList(tempIds)}))`, tempIds);
    await run('production_temp_machine_lines', `DELETE FROM production_temp_machine_lines WHERE temp_report_id IN (${inList(tempIds)})`, tempIds);
    await run('production_temp_deductions', `DELETE FROM production_temp_deductions WHERE temp_report_id IN (${inList(tempIds)})`, tempIds);
    await run('production_temp_defects', `DELETE FROM production_temp_defects WHERE temp_report_id IN (${inList(tempIds)})`, tempIds);
  }
  if (reportIds.length) {
    await run('production_report_machine_defects', `DELETE FROM production_report_machine_defects WHERE machine_line_id IN (SELECT id FROM production_report_machine_lines WHERE report_id IN (${inList(reportIds)}))`, reportIds);
    await run('production_report_machine_lines', `DELETE FROM production_report_machine_lines WHERE report_id IN (${inList(reportIds)})`, reportIds);
    await run('production_reports', `DELETE FROM production_reports WHERE id IN (${inList(reportIds)})`, reportIds);
  }
  if (tempIds.length) await run('production_reports_temp', `DELETE FROM production_reports_temp WHERE id IN (${inList(tempIds)})`, tempIds);
  return { tempIds, reportIds };
}

const num = (value) => Number(value);

/**
 * Everything a write test needs, or the reason it must SKIP:
 * a guarded E2E DB, an API whose DB is that same E2E DB, and E2E accounts.
 */
async function prepareWriteContext({ layer }) {
  const verdict = await guard.checkDatabase();
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  const fixture = config.fixture();
  if (!fixture.ok) return { ok: false, reason: fixture.reason };
  const { resolveApiTarget } = require('./api-client.cjs');
  let target;
  try { target = await resolveApiTarget({ layer }); } catch (error) { return { ok: false, reason: `API target unavailable: ${error.message}` }; }
  const allowed = guard.apiWriteAllowed(target);
  if (!allowed.ok) { await target.stop(); return { ok: false, reason: allowed.reason }; }
  const db = await connect();
  return { ok: true, reason: '', fixture, target, db, close: async () => { await db.end(); await target.stop(); } };
}

module.exports = {
  connect,
  newRunId,
  localDate,
  gcMasterData,
  gcTwoMachineScenario,
  gcPayload,
  tempReportByNote,
  tempMachineLines,
  approvedReportForTemp,
  approvedMachineLines,
  cleanupRun,
  prepareWriteContext,
  num
};
