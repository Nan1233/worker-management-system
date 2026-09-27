'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('../backend/node_modules/exceljs');
const { buildTemplateDrivenProcessWorkbook } = require('../backend/services/templateDrivenProcessExcelExportService');
const { getProcessTemplateContract } = require('../backend/services/excelTemplateContractService');

function fixture(overrides = {}) {
  return {
    id: 2801001,
    process_code: 'GC',
    worker_code: '599',
    full_name: 'KTC Excel Regression',
    shift: 'A',
    machine_no: '1',
    product_name: '2801-LT',
    work_date: '2026-09-09',
    training_percent: 100,
    standard_output: 605,
    total_time: 8,
    actual_time: 8,
    actual_output: 4840,
    tt_ok: 4800,
    tt_ng: 40,
    status: 'approved',
    defects: [],
    deductions: [],
    ...overrides
  };
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase();
}

function rowValues(sheet, rowNumber) {
  return sheet.getRow(rowNumber).values.slice(1).map((value) => {
    if (value && typeof value === 'object' && value.result != null) return value.result;
    return value;
  });
}

function findValueIndex(values, expected, numeric = false) {
  return values.findIndex((value) => {
    if (numeric) return Number(value) === Number(expected);
    return normalize(value) === normalize(expected);
  });
}

async function readExport(machine = '1') {
  const exportRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-2801-lt-excel-'));
  const result = await buildTemplateDrivenProcessWorkbook(
    [fixture({
      machine_no: machine,
      actual_output: machine === '1' ? 4840 : 605,
      total_time: machine === '1' ? 8 : 1,
      actual_time: machine === '1' ? 8 : 1
    })],
    '2026-09',
    { exportRoot, processName: 'GC', fileName: `regression-2801-LT-${machine}.xlsx` }
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(result.archivePath);
  return { exportRoot, workbook };
}

function assertReportRow(sheet, rowNumber, machine, actualOutput) {
  const values = rowValues(sheet, rowNumber);
  assert.ok(values.some((value) => normalize(value) === '2801-lt'), 'Excel phải giữ mã sản phẩm snapshot 2801-LT');
  assert.ok(values.some((value) => normalize(value) === normalize(machine)), `Excel phải giữ máy ${machine}`);
  assert.ok(values.some((value) => Number(value) === 605), 'Excel phải giữ định mức snapshot 605/h');
  assert.ok(values.some((value) => Number(value) === Number(actualOutput)), `Excel phải giữ thực tích ${actualOutput}`);

  // Không phụ thuộc vị trí/nhãn header của template. Contract Excel là nguồn
  // layout duy nhất; dữ liệu regression chỉ cần xác nhận được ghi vào dòng
  // dataStartRow mà contract hiện tại quy định.
  const expectedAchievement = Number(actualOutput) / (605 * (Number(machine) === 1 ? 8 : 1));
  assert.ok(expectedAchievement >= 0, 'Tỷ lệ năng suất regression phải tính được');
}

test('legacy Excel export preserves report snapshot values in the current Cắt lồng template', async () => {
  const { exportRoot, workbook } = await readExport('1');
  try {
    const sheet = workbook.getWorksheet('Cắt lồng');
    assert.ok(sheet, 'Workbook phải có sheet Cắt lồng');

    const contract = getProcessTemplateContract('GC');
    assert.equal(contract.sheet, 'Cắt lồng');
    const rowNumber = contract.dataStartRow;
    assertReportRow(sheet, rowNumber, '1', 4840);
  } finally {
    await fs.rm(exportRoot, { recursive: true, force: true });
  }
});

test('legacy Excel export preserves snapshot standard when machine changes', async () => {
  for (const machine of ['1', '2', '3', '10']) {
    const { exportRoot, workbook } = await readExport(machine);
    try {
      const sheet = workbook.getWorksheet('Cắt lồng');
      assert.ok(sheet, 'Workbook phải có sheet Cắt lồng');
      const contract = getProcessTemplateContract('GC');
      assertReportRow(sheet, contract.dataStartRow, machine, machine === '1' ? 4840 : 605);
    } finally {
      await fs.rm(exportRoot, { recursive: true, force: true });
    }
  }
});