'use strict';
// Regression for POST /api/reports/export-excel pinning the CPU at 100 % and never answering.
//  1. clearSheetData looped `c <= sheet.columnCount` (ExcelJS rescans every row on each read) over every
//     (row, column) of a ~500k-cell template  => O(n^2), minutes of synchronous CPU.
//  2. `sheet.mergedCells` does not exist in ExcelJS, so template merges were never removed and the
//     first writeDateRow()/mergeCells() threw "Cannot merge already merged cells" once (1) was fast.
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { __test: { clearSheetData } } = require('../services/commonProcessMonthlyExcelService');

function bigTemplateSheet(rows, cols) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Cắt lồng');
  for (let r = 1; r <= rows; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= cols; c += 1) { const cell = row.getCell(c); cell.value = r === 1 ? `H${c}` : null; cell.font = { bold: r === 1 }; }
  }
  sheet.getCell('A7').value = 'old data';
  sheet.getCell('AM7').value = 12345;
  sheet.mergeCells('A9:F9');
  sheet.getCell('A9').value = 'old date row';
  sheet.getColumn(80).width = 17;
  return sheet;
}

test('clearSheetData empties values, keeps styles and releases template merges', () => {
  const sheet = bigTemplateSheet(40, 90);
  clearSheetData(sheet);
  assert.equal(sheet.getCell('A1').value, null);
  assert.equal(sheet.getCell('A7').value, null);
  assert.equal(sheet.getCell('AM7').value, null);
  assert.equal(sheet.getCell('A9').value, null);
  assert.equal(sheet.getCell('A1').font.bold, true, 'style survives');
  assert.equal(sheet.getColumn(80).width, 17, 'column widths survive');
  assert.doesNotThrow(() => sheet.mergeCells('A9:F9'), 'the row can be merged again after clearing');
});

test('clearSheetData stays fast on a template-sized worksheet (4491 x 114 cells)', () => {
  const sheet = bigTemplateSheet(4491, 114);
  const started = Date.now();
  clearSheetData(sheet);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 5000, `clearSheetData took ${elapsed} ms`);
});
