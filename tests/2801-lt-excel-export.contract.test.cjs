'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');
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

test('2801-LT Lồng exports canonical 605/h standard and achievement from snapshot', async () => {
  const exportRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-2801-lt-excel-'));
  try {
    const result = await buildTemplateDrivenProcessWorkbook(
      [fixture()],
      '2026-09',
      { exportRoot, processName: 'GC', fileName: 'regression-2801-LT.xlsx' }
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(result.archivePath);
    const sheet = workbook.getWorksheet('Cắt lồng');
    assert.ok(sheet, 'Workbook phải có sheet Cắt lồng');

    const header = sheet.getRow(326).values;
    const find = (label) => {
      const index = header.findIndex((value) => String(value ?? '').trim() === label);
      assert.ok(index > 0, `Không tìm thấy cột ${label}`);
      return index;
    };

    const standardCol = find('Định mức');
    const actualCol = find('Thực tích');
    const achievementCol = find('% năng suất');
    const productCol = find('Mã sản phẩm');
    const machineCol = find('Số máy');

    assert.equal(sheet.getCell(327, productCol).value, '2801-LT');
    assert.equal(String(sheet.getCell(327, machineCol).value), '1');
    assert.equal(sheet.getCell(327, standardCol).value, 605, '2801-LT Lồng phải giữ định mức snapshot 605/h');
    assert.equal(sheet.getCell(327, actualCol).value, 4840);
    assert.equal(Number(sheet.getCell(327, achievementCol).value.toFixed(8)), 1, '4840/(605*8) phải bằng 100%');
  } finally {
    await fs.rm(exportRoot, { recursive: true, force: true });
  }
});

test('2801-LT export remains 605/h when machine changes', async () => {
  const exportRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ktc-2801-lt-excel-machines-'));
  try {
    for (const machine of ['1', '2', '3', '10']) {
      const result = await buildTemplateDrivenProcessWorkbook(
        [fixture({ id: Number(`2801${machine}`), machine_no: machine, actual_output: 605, total_time: 1, actual_time: 1 })],
        '2026-09',
        { exportRoot, processName: 'GC', fileName: `regression-2801-LT-${machine}.xlsx` }
      );
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(result.archivePath);
      const sheet = workbook.getWorksheet('Cắt lồng');
      const header = sheet.getRow(326).values;
      const standardCol = header.findIndex((value) => String(value ?? '').trim() === 'Định mức');
      assert.ok(standardCol > 0);
      assert.equal(sheet.getCell(327, standardCol).value, 605, `Máy ${machine}: 2801-LT Lồng phải giữ 605/h`);
    }
  } finally {
    await fs.rm(exportRoot, { recursive: true, force: true });
  }
});
