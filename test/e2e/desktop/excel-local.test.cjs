'use strict';

// desktop/electron/companyExcelLocal.cjs builds the monthly company workbooks on
// the PC from /reports/export-excel/company-data. Output files are written to
// test-results/e2e-results/desktop/ and reloaded to validate them.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../lib/config.cjs');

const DESKTOP = path.join(config.ROOT, 'desktop');
const skip = fs.existsSync(path.join(DESKTOP, 'node_modules', 'exceljs'))
  ? false
  : 'desktop/node_modules missing (run: cd desktop && npm ci --omit=dev --ignore-scripts)';

const load = () => ({
  ExcelJS: require(path.join(DESKTOP, 'node_modules', 'exceljs')),
  ...require(path.join(DESKTOP, 'electron', 'companyExcelLocal.cjs'))
});

function gcReport(overrides = {}) {
  return {
    id: 7001, work_date: '2026-09-01', worker_code: '4310', full_name: 'Desktop E2E', shift: 'A', training_percent: 100,
    operation_mode: 'MACHINE', product_name: 'E2E-5770', total_time: 8, actual_time: 7.5, deduction_time: 0.5,
    standard_output: 600, tt_ok: 100, tt_ng: 5, actual_output: 100, deductions: [], defects: [], machineLines: [],
    ...overrides
  };
}

const payloadFor = (reports) => ({
  groups: {
    GIA_CONG: { processes: [{ process: { process_code: 'GC' }, reports, deductionTypes: [], defectTypes: [] }] },
    MAI_DO: { processes: [] }
  }
});

async function buildGc(reports, name) {
  const { ExcelJS, buildCompanyExcelLocal } = load();
  const built = await buildCompanyExcelLocal({ appPath: DESKTOP, date: '2026-09-15', groupCode: 'GIA_CONG', payload: payloadFor(reports) });
  const file = path.join(config.layerDir('desktop'), name);
  fs.writeFileSync(file, built.buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  return { built, sheet: workbook.getWorksheet('Cắt lồng'), workbook };
}

/** Rows of the GC sheet whose worker-code cell (B) equals code. */
function rowsFor(sheet, code) {
  const rows = [];
  sheet.eachRow((row, number) => { if (String(row.getCell(2).value ?? '') === code) rows.push(number); });
  return rows;
}

test('GIA_CONG workbook: valid xlsx, requested period and file name', { skip }, async () => {
  const { built, workbook } = await buildGc([gcReport()], 'desktop-gia-cong-day1.xlsx');
  assert.equal(built.requestedYearMonth, '2026-09');
  assert.equal(built.fileName, 'A+B GIA CÔNG THÁNG 09-2026.xlsx');
  assert.ok(built.buffer.length > 1000 && built.buffer[0] === 0x50 && built.buffer[1] === 0x4b, 'zip/xlsx signature');
  assert.ok(workbook.getWorksheet('Cắt lồng'), 'target sheet exists');
});

test('GIA_CONG: report on day 1 is written with its own values', { skip }, async () => {
  const { sheet } = await buildGc([gcReport()], 'desktop-gia-cong-day1-values.xlsx');
  const rows = rowsFor(sheet, '4310');
  assert.equal(rows.length, 1);
  const row = sheet.getRow(rows[0]);
  assert.equal(row.getCell(1).value, 1, 'STT');
  assert.equal(row.getCell(5).value, 'A', 'shift');
  assert.equal(row.getCell(27).value, 'E2E-5770', 'product');
});

// BUG REPRO (see report): the bundled "Cắt lồng" template has a single data block,
// buildCompanyExcelLocal indexes blocks by day (blocks[day - 1]) and silently skips
// every day whose block does not exist, so only reports of day 1 reach the file.
test('GIA_CONG: report on day 3 is written (not silently dropped)', { skip }, async () => {
  const { sheet } = await buildGc([gcReport({ id: 7002, work_date: '2026-09-03', worker_code: '4311' })], 'desktop-gia-cong-day3.xlsx');
  assert.equal(rowsFor(sheet, '4311').length, 1, 'report dated 2026-09-03 is missing from the workbook');
});

// FINDING: the backend GC export (04_CAT_LONG, source of truth) writes one row per
// machine line; the desktop local exporter has no machine-line handling.
test('GIA_CONG: report with 2 machine lines -> 2 rows (04_CAT_LONG rule)', { skip }, async () => {
  const report = gcReport({
    id: 7003, worker_code: '4312', machine_no: '5, 6', product_name: 'E2E-5770, E2E-9116',
    machineLines: [
      { id: 1, sort_order: 1, machine_code: '5', product_code: 'E2E-5770', machine_time_hours: 4.5, deduction_time_hours: 0.5, ok_quantity: 100, ng_quantity: 5, defects: [] },
      { id: 2, sort_order: 2, machine_code: '6', product_code: 'E2E-9116', machine_time_hours: 6, deduction_time_hours: 1, ok_quantity: 240, ng_quantity: 12, defects: [] }
    ]
  });
  const { sheet } = await buildGc([report], 'desktop-gia-cong-two-machines.xlsx');
  assert.equal(rowsFor(sheet, '4312').length, 2, 'expected one row per machine line');
});

test('GIA_CONG: days 1, 3 and 15 all land in one workbook, STT resets per day', { skip }, async () => {
  const reports = [
    gcReport({ id: 7010, work_date: '2026-09-01', worker_code: '5001' }),
    gcReport({ id: 7011, work_date: '2026-09-01', worker_code: '5002' }),
    gcReport({ id: 7012, work_date: '2026-09-03', worker_code: '5003' }),
    gcReport({ id: 7013, work_date: '2026-09-15', worker_code: '5004' }),
    gcReport({ id: 7014, work_date: '2026-09-15', worker_code: '5005' })
  ];
  const { sheet } = await buildGc(reports, 'desktop-gia-cong-multi-day.xlsx');
  const stt = (code) => { const [r] = rowsFor(sheet, code); assert.ok(r, `worker ${code} missing`); return sheet.getRow(r).getCell(1).value; };
  assert.deepEqual(['5001', '5002', '5003', '5004', '5005'].map(stt), [1, 2, 1, 1, 2]);
  // each date has its own date row (A = date, B blank) placed before its data rows
  const dateRows = [];
  sheet.eachRow((row, n) => { if (row.getCell(1).value instanceof Date && !row.getCell(2).value && !row.hidden) dateRows.push(n); });
  assert.equal(dateRows.length, 3);
  assert.ok(rowsFor(sheet, '5003')[0] > dateRows[1] && rowsFor(sheet, '5003')[0] < dateRows[2]);
});

test('GIA_CONG: 2 machine lines -> per-line machine, product, actual time, OK/NG (no summed total)', { skip }, async () => {
  const report = gcReport({
    id: 7020, worker_code: '4320', machine_no: '5, 6', product_name: 'E2E-5770, E2E-9116', total_time: 10.5, deduction_time: 1.5,
    machineLines: [
      { id: 1, sort_order: 1, machine_code: '5', product_code: 'E2E-5770', machine_time_hours: 4.5, deduction_time_hours: 0.5, ok_quantity: 100, ng_quantity: 5 },
      { id: 2, sort_order: 2, machine_code: '6', product_code: 'E2E-9116', machine_time_hours: 6, deduction_time_hours: 1, ok_quantity: 240, ng_quantity: 12 }
    ]
  });
  const { sheet } = await buildGc([report], 'desktop-gia-cong-line-values.xlsx');
  const rows = rowsFor(sheet, '4320');
  assert.equal(rows.length, 2);
  const [a, b] = rows.map((n) => sheet.getRow(n));
  assert.deepEqual([a.getCell(4).value, b.getCell(4).value], ['5', '6'], 'machine column is one code per row');
  assert.deepEqual([a.getCell(27).value, b.getCell(27).value], ['E2E-5770', 'E2E-9116']);
  assert.deepEqual([a.getCell(7).value, b.getCell(7).value], [4.5, 6], 'total time per line, not 9h/10.5h');
  assert.deepEqual([a.getCell(8).value.result, b.getCell(8).value.result], [4, 5], 'actual time per machine');
  assert.deepEqual([a.getCell(10).value, b.getCell(10).value], [0.5, 1], 'deduction per line');
  assert.deepEqual([a.getCell(33).value, b.getCell(33).value], [100, 240], 'OK');
  assert.deepEqual([a.getCell(29).value, b.getCell(29).value], [105, 252], 'OK + NG');
  assert.deepEqual([a.getCell(1).value, b.getCell(1).value], [1, 2]);
});

test('GIA_CONG: manual report (no machine lines) -> 1 row, machine blank', { skip }, async () => {
  const { sheet } = await buildGc([gcReport({ id: 7030, worker_code: '4330', machine_no: null })], 'desktop-gia-cong-manual.xlsx');
  const rows = rowsFor(sheet, '4330');
  assert.equal(rows.length, 1);
  assert.ok(!sheet.getRow(rows[0]).getCell(4).value, 'machine blank');
});

test('GIA_CONG: written row keeps its formulas (deduction total, actual time)', { skip }, async () => {
  const { sheet } = await buildGc([gcReport()], 'desktop-gia-cong-formulas.xlsx');
  const [rowNumber] = rowsFor(sheet, '4310');
  const row = sheet.getRow(rowNumber);
  assert.equal(row.getCell(10).value?.formula, `SUM(K${rowNumber}:Z${rowNumber})`);
  assert.equal(row.getCell(8).value?.formula, `MAX(0,G${rowNumber}-J${rowNumber})`);
});

test('unknown group is rejected instead of producing a file', { skip }, async () => {
  const { buildCompanyExcelLocal } = load();
  await assert.rejects(buildCompanyExcelLocal({ appPath: DESKTOP, date: '2026-09-15', groupCode: 'NOPE', payload: payloadFor([]) }), /không hợp lệ/);
});
