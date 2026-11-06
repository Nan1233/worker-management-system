const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ExcelJS = require('exceljs');
const { buildProcessExcelLocal } = require('../electron/companyExcelLocal.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const templateRoot = path.join(repoRoot, 'backend', 'templates');

function formulaCount(sheet) {
  let count = 0;
  sheet.eachRow({ includeEmpty: false }, (row) => row.eachCell({ includeEmpty: false }, (cell) => {
    const value = cell.value;
    if (value && typeof value === 'object' &&
        (typeof value.formula === 'string' || typeof value.sharedFormula === 'string')) count += 1;
  }));
  return count;
}

function styleSnapshot(sheet, maxRow = 12, maxColumn = 49) {
  const result = {};
  for (let row = 1; row <= Math.min(maxRow, sheet.rowCount); row += 1) {
    for (let col = 1; col <= Math.min(maxColumn, sheet.columnCount); col += 1) {
      const cell = sheet.getRow(row).getCell(col);
      if (cell.hasStyle) result[cell.address] = JSON.stringify(cell.style);
    }
  }
  return result;
}

const cases = [
  { code: 'MAI', file: 'TT_MAI_TEMPLATE.xlsx', sheet: 'TT Mài' },
  { code: 'DO', file: 'TT_DO_TEMPLATE.xlsx', sheet: 'TT Đo' }
];

for (const item of cases) {
  test(`${item.code}: xuất từ đúng template gốc và giữ nguyên công thức/style/sheet`, async () => {
    const sourcePath = path.join(templateRoot, item.file);
    assert.ok(fs.existsSync(sourcePath), `Thiếu template test: ${sourcePath}`);

    const original = new ExcelJS.Workbook();
    await original.xlsx.readFile(sourcePath);
    const originalSheet = original.getWorksheet(item.sheet);
    assert.ok(originalSheet, `Template gốc thiếu sheet ${item.sheet}`);
    const originalFormulaCount = formulaCount(originalSheet);
    const originalStyles = styleSnapshot(originalSheet);
    const originalSheetStates = original.worksheets.map((sheet) => [sheet.name, sheet.state]);

    const built = await buildProcessExcelLocal({
      appPath: path.join(repoRoot, 'desktop'),
      date: '2026-10-01',
      processCode: item.code,
      payload: { groups: { MAI_DO: { processes: [] } } }
    });

    assert.equal(path.resolve(built.sourcePath), path.resolve(sourcePath),
      'Không được lấy template cùng tên từ thư mục khác hoặc bản cũ');
    assert.equal(built.fileName, item.code === 'MAI' ? '05_MAI_10-2026.xlsx' : '06_DO_10-2026.xlsx');

    const output = new ExcelJS.Workbook();
    await output.xlsx.load(built.buffer);
    const outputSheet = output.getWorksheet(item.sheet);
    assert.ok(outputSheet, `Workbook xuất thiếu sheet ${item.sheet}`);
    assert.deepEqual(output.worksheets.filter((sheet) => sheet.name !== '_KTC_META')
      .map((sheet) => [sheet.name, sheet.state]), originalSheetStates,
      'Không được ẩn/hiện hoặc đổi trạng thái các sheet gốc');
    assert.equal(formulaCount(outputSheet), originalFormulaCount,
      'Không được xóa công thức trong vùng dữ liệu của template');

    const outputStyles = styleSnapshot(outputSheet);
    for (const [address, style] of Object.entries(originalStyles)) {
      assert.equal(outputStyles[address], style, `Style ô ${address} bị thay đổi so với template`);
    }
  });
}

test('Mài và Đo phải dùng hai template khác nhau', () => {
  const mai = fs.readFileSync(path.join(templateRoot, 'TT_MAI_TEMPLATE.xlsx'));
  const doTemplate = fs.readFileSync(path.join(templateRoot, 'TT_DO_TEMPLATE.xlsx'));
  assert.notDeepEqual(mai, doTemplate, 'Template Mài và Đo không được dùng chung một workbook');
});
