'use strict';

const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

require('../electron/excelReportDateSubmissionPatch.cjs');
const { buildWorkerProcessWorkbook } = require('../electron/workerReportTemplateLocal.v2.cjs');

function baseReport(overrides = {}) {
  return {
    id: 1,
    dataSource: 'production_reports',
    isApprovedDatabaseRecord: true,
    work_date: '2026-09-05',
    submitted_at: '2026-09-06 08:15:32',
    worker_code: '845',
    full_name: 'Regression Worker',
    shift: 'A',
    operation_type: 'CUT',
    operation_mode: 'MANUAL',
    machine_no: 'M-01',
    product_name: 'QC5-1657',
    training_percent: 100,
    standard_output: 100,
    total_time: 8,
    actual_time: 8,
    deduction_time: 0,
    tt_ok: 10,
    tt_ng: 0,
    actual_output: 10,
    status: 'approved',
    ...overrides
  };
}

async function build(reports) {
  return buildWorkerProcessWorkbook({
    appPath: require('node:path').resolve(__dirname, '..'),
    processCode: 'GC',
    processName: 'Gia công',
    date: '2026-09-01',
    processData: { deductionTypes: [], defectTypes: [], reports }
  });
}

function findDateRows(sheet) {
  const rows = [];
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const value = sheet.getRow(r).getCell(1).value;
    if (value instanceof Date) rows.push({ row: r, value });
  }
  return rows;
}

function findWorkerRow(sheet, code) {
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    if (String(sheet.getRow(r).getCell(3).value ?? '') === String(code)) return r;
  }
  return null;
}

async function inspect(built) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(built.buffer);
  const sheet = workbook.worksheets.find((item) => item.state !== 'hidden') || workbook.worksheets[0];
  assert.ok(sheet, 'Workbook phải có worksheet');
  assert.equal(sheet.getColumn(2).hidden, true, 'Cột B phải hidden');
  assert.equal(String(sheet.getRow(built.headerRow).getCell(2).value), 'Thời gian nộp báo cáo');
  assert.equal(String(sheet.getRow(built.headerRow).getCell(3).value).trim(), 'Mã NV');
  return sheet;
}

(async () => {
  // CASE 1: report date 05/09, submission 06/09 -> date row stays 05/09.
  let built = await build([baseReport()]);
  let sheet = await inspect(built);
  let dateRows = findDateRows(sheet);
  assert.equal(dateRows.length, 1);
  assert.equal(dateRows[0].value.getUTCFullYear(), 2026);
  assert.equal(dateRows[0].value.getUTCMonth(), 8);
  assert.equal(dateRows[0].value.getUTCDate(), 5);
  let workerRow = findWorkerRow(sheet, '845');
  assert.ok(workerRow, 'Phải tìm thấy worker row');
  const submission = sheet.getRow(workerRow).getCell(2).value;
  assert.ok(submission instanceof Date, 'Cột B phải chứa timestamp');
  assert.equal(submission.getUTCFullYear(), 2026);
  assert.equal(submission.getUTCMonth(), 8);
  assert.equal(submission.getUTCDate(), 6);
  assert.equal(submission.getUTCHours(), 8);
  assert.equal(submission.getUTCMinutes(), 15);
  assert.equal(submission.getUTCSeconds(), 32);

  // CASE 2: same report/submission date -> date row still follows work_date.
  built = await build([baseReport({ submitted_at: '2026-09-05 10:20:00' })]);
  sheet = await inspect(built);
  dateRows = findDateRows(sheet);
  assert.equal(dateRows.length, 1);
  assert.equal(dateRows[0].value.getUTCDate(), 5);

  // CASE 3: report date 30/09, submission 01/10 -> remains September.
  built = await build([baseReport({ work_date: '2026-09-30', submitted_at: '2026-10-01 00:05:00' })]);
  sheet = await inspect(built);
  dateRows = findDateRows(sheet);
  assert.equal(dateRows.length, 1);
  assert.equal(dateRows[0].value.getUTCMonth(), 8);
  assert.equal(dateRows[0].value.getUTCDate(), 30);
  workerRow = findWorkerRow(sheet, '845');
  assert.ok(workerRow);
  assert.equal(sheet.getRow(workerRow).getCell(2).value.getUTCMonth(), 9);
  assert.equal(sheet.getRow(workerRow).getCell(2).value.getUTCDate(), 1);

  console.log('[PASS] Excel report_date uses DB work_date; hidden B uses true submission timestamp; month boundary preserved.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
