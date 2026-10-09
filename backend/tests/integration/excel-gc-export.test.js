'use strict';

// Real database + the real backend GC exporter (04_CAT_LONG template).
// Deterministic dataset: ONE physical machine, FOUR workers on the same day, different
// durations and deductions. The workbook must show each worker's own net hours once -
// the machine time must never be multiplied by the number of workers - and the day
// block must carry the report's business date (work_date), not a timestamp.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const h = require('./harness');

const opts = { skip: h.skipReason };
const s = {};

// Work date chosen so that a timestamp-derived date (created_at = "today") could never match it.
const WORK_DATE = '2026-09-05';
const WORKERS = [
  { code: 'GC-A', hours: 2, deduction: 0.5, ok: 100, ng: 2 },
  { code: 'GC-B', hours: 3, deduction: 0, ok: 150, ng: 0 },
  { code: 'GC-C', hours: 1, deduction: 0.25, ok: 40, ng: 1 },
  { code: 'GC-D', hours: 2, deduction: 0, ok: 90, ng: 0 }
];

test.before(async () => {
  if (!h.enabled) return;
  process.env.EXCEL_COMPANY_TEMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'ktc-excel-'));
  const { db } = await h.start();
  s.db = db;
  const [[gc]] = await db.query("SELECT id FROM processes WHERE process_code='GC'");
  const [[machine]] = await db.query("SELECT id, machine_code FROM machines WHERE process_id=? AND status='active' ORDER BY id LIMIT 1", [gc.id]);
  const [[deduction]] = await db.query("SELECT id, deduction_code, deduction_name FROM deduction_types WHERE process_id=? AND status='active' ORDER BY sort_order, id LIMIT 1", [gc.id]);
  s.gc = gc; s.machine = machine; s.deduction = deduction;
  s.reports = [];
  let seq = 0;
  for (const spec of WORKERS) {
    seq += 1;
    const user = await h.createUser(db, { username: spec.code, role: 'worker', workerCode: spec.code, fullName: `Công nhân ${spec.code}`, processCodes: ['GC'] });
    const net = spec.hours - spec.deduction;
    const [report] = await db.query(
      `INSERT INTO production_reports (source_temp_id, worker_id, process_id, work_date, entry_date, shift, operation_type, operation_mode, machine_no, product_name,
         total_time, actual_time, deduction_time, standard_output, tt_ok, tt_ng, actual_output, status, approved_at)
       VALUES (?, ?, ?, ?, NOW(), 'A', 'CUT', 'MACHINE', ?, 'SP-TEST', ?, ?, ?, 100, ?, ?, ?, 'approved', NOW())`,
      [1000 + seq, user.workerId, gc.id, WORK_DATE, machine.machine_code, spec.hours, net, spec.deduction, spec.ok, spec.ng, spec.ok + spec.ng]
    );
    const reportId = report.insertId;
    const deductions = spec.deduction > 0
      ? [{ deduction_type_id: deduction.id, deduction_code: deduction.deduction_code, deduction_name: deduction.deduction_name, hours: spec.deduction }]
      : [];
    await db.query(
      `INSERT INTO production_report_machine_lines (report_id, machine_id, machine_code, product_code, machine_time_hours, standard_output, ok_quantity, ng_quantity,
         maximum_output, deduction_time_hours, deductions_json, counted_output, earned_standard_hours, defects_json, sort_order)
       VALUES (?, ?, ?, 'SP-TEST', ?, 100, ?, ?, ?, ?, ?, ?, ?, '[]', 1)`,
      [reportId, machine.id, machine.machine_code, spec.hours, spec.ok, spec.ng, net * 100, spec.deduction, JSON.stringify(deductions), spec.ok, net]
    );
    for (const item of deductions) {
      await db.query('INSERT INTO production_report_deductions (report_id, deduction_type_id, hours) VALUES (?, ?, ?)', [reportId, item.deduction_type_id, item.hours]);
    }
    s.reports.push({ id: reportId, ...spec });
  }
});

test.after(async () => {
  if (!h.enabled) return;
  await h.stop();
});

async function buildSheet() {
  const ExcelJS = require('exceljs');
  const { buildCompanyWorkbook } = require('../../services/companyExcelExportService');
  const result = await buildCompanyWorkbook('2026-09', 'GIA_CONG');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(result.path);
  return { result, sheet: workbook.getWorksheet('Báo cáo công nhân') };
}

const { LAYOUTS } = require('../../config/excelLayouts');
const FIXED = LAYOUTS.GIA_CONG_04.fixed;
const numberAt = (row, column) => Number(row.getCell(column).value?.result ?? row.getCell(column).value ?? 0);

test('GC workbook: one date block carrying the business work date, one row per worker line', opts, async () => {
  const { result, sheet } = await buildSheet();
  assert.equal(result.reportCount, WORKERS.length);
  assert.ok(sheet, 'sheet "Báo cáo công nhân" must exist');

  // First date row = row 4 (template), data rows follow it.
  const dateCell = sheet.getRow(4).getCell(1).value;
  assert.ok(dateCell instanceof Date, `date row must hold a real date, got ${JSON.stringify(dateCell)}`);
  assert.equal(dateCell.toISOString().slice(0, 10), WORK_DATE, 'date block must be the work date, never created_at');

  const rows = [5, 6, 7, 8].map((n) => sheet.getRow(n));
  assert.deepEqual(rows.map((r) => String(r.getCell(FIXED.workerCode).value)).sort(), WORKERS.map((w) => w.code).sort());
  for (const row of rows) assert.equal(String(row.getCell(FIXED.machine).value), s.machine.machine_code);
  assert.equal(sheet.getRow(9).getCell(FIXED.workerCode).value ?? null, null, 'no fifth row');
});

test('GC workbook: each worker shows own net machine hours once (physical time is never multiplied)', opts, async () => {
  const { sheet } = await buildSheet();
  const byCode = new Map([5, 6, 7, 8].map((n) => [String(sheet.getRow(n).getCell(FIXED.workerCode).value), sheet.getRow(n)]));
  let totalWorked = 0;
  let totalDeduction = 0;
  for (const spec of WORKERS) {
    const row = byCode.get(spec.code);
    const worked = numberAt(row, FIXED.workedHours);
    assert.equal(worked, spec.hours - spec.deduction, `${spec.code}: net = gross - deduction`);
    assert.equal(numberAt(row, FIXED.deductionTotal), spec.deduction, `${spec.code}: deduction total`);
    assert.equal(numberAt(row, FIXED.ok), spec.ok, `${spec.code}: OK`);
    assert.equal(numberAt(row, FIXED.totalNg), spec.ng, `${spec.code}: NG`);
    assert.equal(numberAt(row, FIXED.tt), spec.ok + spec.ng, `${spec.code}: TT = OK + NG`);
    totalWorked += worked;
    totalDeduction += spec.deduction;
  }
  const gross = WORKERS.reduce((sum, w) => sum + w.hours, 0);
  assert.equal(totalWorked + totalDeduction, gross, 'worked + deduction must equal the gross hours entered (no ×4)');
  assert.equal(totalWorked, 7.25); // 8 h gross - 0.75 h deductions
});

test('GC workbook: the deduction lands in the template column of its deduction type', opts, async () => {
  const { sheet } = await buildSheet();
  const label = (column) => String(sheet.getRow(3).getCell(column).value ?? '').trim();
  const [first, last] = LAYOUTS.GIA_CONG_04.deductions;
  let column = null;
  for (let c = first; c <= last; c += 1) {
    if (label(c).toLowerCase() === String(s.deduction.deduction_name).trim().toLowerCase()) column = c;
  }
  assert.ok(column, `template must have a column labelled "${s.deduction.deduction_name}"`);
  const rowA = [5, 6, 7, 8].map((n) => sheet.getRow(n)).find((r) => String(r.getCell(FIXED.workerCode).value) === 'GC-A');
  assert.equal(numberAt(rowA, column), 0.5);
});
