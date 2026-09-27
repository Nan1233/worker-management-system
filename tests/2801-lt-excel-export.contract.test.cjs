'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('../backend/node_modules/exceljs');
const { buildTemplateDrivenProcessWorkbook } = require('../backend/services/templateDrivenProcessExcelExportService');

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

function normalized(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findHeaderRow(sheet, requiredLabels) {
  const required = requiredLabels.map(normalized);
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 350); rowNumber += 1) {
    const values = sheet.getRow(rowNumber).values.map(normalized);
    if (required.every((label) => values.some((value) => value === label || value.includes(label)))) {
      return rowNumber;
    }
  }
  return null;
}

function findColumn(sheet, rowNumber, ...labels) {
  const values = sheet.getRow(rowNumber).values.map(normalized);
  for (const label of labels) {
    const needle = normalized(label);
    const index = values.findIndex((value) => value === needle || value.includes(needle));
    if (index > 0) return index;
  }
  return null;
}

async function readExport(machine = '1') {
  const exportRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-2801-lt-excel-'));
  const result = await buildTemplateDrivenProcessWorkbook(
    [fixture({ machine_no: machine, actual_output: machine === '1' ? 4840 : 605, total_time: machine === '1' ? 8 : 1, actual_time: machine === '1' ? 8 : 1 })],
    '2026-09',
    { exportRoot, processName: 'GC', fileName: `regression-2801-LT-${machine}.xlsx` }
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(result.archivePath);
  return { exportRoot, workbook };
}

test('legacy Excel export preserves report snapshot values in the current Cắt lồng template', async () => {
  const { exportRoot, workbook } = await readExport('1');
  try {
    const sheet = workbook.getWorksheet('Cắt lồng');
    assert.ok(sheet, 'Workbook phải có sheet Cắt lồng');

    const headerRow = findHeaderRow(sheet, ['Mã sản phẩm', 'Số máy', 'Định mức']);
    assert.ok(headerRow, 'Không tìm thấy hàng tiêu đề hiện tại của sheet Cắt lồng');

    const productCol = findColumn(sheet, headerRow, 'Mã sản phẩm', 'Mã sp');
    const machineCol = findColumn(sheet, headerRow, 'Số máy', 'Máy');
    const standardCol = findColumn(sheet, headerRow, 'Định mức', 'KH', 'ĐM');
    const actualCol = findColumn(sheet, headerRow, 'Thực tích', 'KQSX', 'Kết quả sản xuất');
    const achievementCol = findColumn(sheet, headerRow, '% năng suất', '% thực tích', '% sản lượng theo kế hoạch');

    assert.ok(productCol && machineCol && standardCol && actualCol && achievementCol, 'Thiếu cột dữ liệu Excel hiện tại');
    const row = sheet.getRow(headerRow + 1);
    assert.equal(row.getCell(productCol).value, '2801-LT');
    assert.equal(String(row.getCell(machineCol).value), '1');
    assert.equal(Number(row.getCell(standardCol).value), 605, 'Phải giữ định mức snapshot 605/h');
    assert.equal(Number(row.getCell(actualCol).value), 4840);
    assert.equal(Number(Number(row.getCell(achievementCol).value).toFixed(8)), 1, '4840/(605*8) phải bằng 100%');
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
      const headerRow = findHeaderRow(sheet, ['Mã sản phẩm', 'Số máy', 'Định mức']);
      assert.ok(headerRow, 'Không tìm thấy hàng tiêu đề hiện tại của sheet Cắt lồng');
      const standardCol = findColumn(sheet, headerRow, 'Định mức', 'KH', 'ĐM');
      assert.ok(standardCol, 'Không tìm thấy cột định mức');
      assert.equal(Number(sheet.getRow(headerRow + 1).getCell(standardCol).value), 605, `Máy ${machine}: phải giữ định mức snapshot 605/h`);
    } finally {
      await fs.rm(exportRoot, { recursive: true, force: true });
    }
  }
});
