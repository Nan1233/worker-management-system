'use strict';

// Structure of the GC source-of-truth template and of every workbook rendered from it.

const test = require('node:test');
const assert = require('node:assert/strict');
const x = require('../lib/xlsx-helpers.cjs');
const fx = require('./fixtures.cjs');

const EXPECTED_HEADERS = [
  'STT', 'Mã NV', 'Tên', 'Máy', 'Ca', 'Thời gian làm việc', 'Tổng thời gian trừ giờ',
  ...fx.GC_DEDUCTION_NAMES,
  'SP', 'Định mức', 'TT', '%TT', 'OK', 'Tổng NG',
  'KQD', 'Vỡ cao su', 'K xước cong gãy', 'Cao su xoay', 'Cắt không đứt', 'bavia', 'CSH', 'ppcm', 'KT lớn', 'KT nhỏ',
  'LCS', 'cắt lẹm', 'rách nvl', 'Chân ngắn dài', 'sót via', 'fure trục', 'lẫn cs', 'bavia cắt hụt', 'thiếu cao su'
];

test('template: one sheet, 48 columns A:AV with the 04_CAT_LONG headers', async () => {
  const workbook = await x.loadWorkbook(x.GC_TEMPLATE);
  assert.deepEqual(workbook.worksheets.map((s) => s.name), [x.GC_SHEET]);
  const sheet = workbook.getWorksheet(x.GC_SHEET);
  assert.equal(sheet.actualColumnCount, 48);
  assert.equal(EXPECTED_HEADERS.length, 48);
  const headers = x.headerMap(sheet);
  EXPECTED_HEADERS.forEach((label, i) => assert.equal(headers.get(i + 1), label, `${x.columnLetter(i + 1)}3`));
  assert.equal(sheet.getRow(3).getCell(49).value, null, 'nothing after AV');
});

test('template: layout contract (H:W deductions, AD:AV defects, AA formula, no sample data)', async () => {
  const workbook = await x.loadWorkbook(x.GC_TEMPLATE);
  const sheet = workbook.getWorksheet(x.GC_SHEET);
  const layout = x.GC_LAYOUT;
  assert.deepEqual(layout.deductions, [x.columnNumber('H'), x.columnNumber('W')]);
  assert.deepEqual(layout.defects, [x.columnNumber('AD'), x.columnNumber('AV')]);
  assert.equal(layout.lastColumn, 48);
  assert.equal(sheet.getCell('AA5').value.formula, 'IFERROR(Z5/Y5,0)');
  for (let c = 1; c <= 48; c += 1) {
    if (c === x.columnNumber('AA')) continue;
    assert.equal(sheet.getRow(4).getCell(c).value, null, `${x.columnLetter(c)}4 empty`);
    assert.equal(sheet.getRow(5).getCell(c).value, null, `${x.columnLetter(c)}5 empty`);
  }
});

test('rendered workbook keeps freeze pane, header height, date style and AA conditional format', async () => {
  const { workbook } = await x.renderGc([fx.twoMachineReport(), fx.manualReport()], { deductionTypes: fx.deductionTypes, defectTypes: fx.defectTypes });
  const { workbook: again } = await x.saveAndReload(workbook, 'excel', 'gc-04-structure.xlsx');
  const sheet = again.getWorksheet(x.GC_SHEET);
  assert.equal(sheet.actualColumnCount, 48);
  assert.equal(sheet.views[0].ySplit, 3);
  assert.equal(sheet.getRow(3).height, 83.1);
  assert.equal(sheet.getCell('A4').fill?.fgColor?.argb, 'FFEA8FD3');
  assert.equal(sheet.conditionalFormattings.length, 1);
  assert.equal(sheet.conditionalFormattings[0].ref, 'AA5:AA7');
});

test('empty month: template stays untouched (no rows, formula kept)', async () => {
  const { sheet, result } = await x.renderGc([], { deductionTypes: fx.deductionTypes, defectTypes: fx.defectTypes });
  assert.deepEqual(result, { rowCount: 0, dayCount: 0, unmapped: [], warnings: [] });
  assert.equal(sheet.getCell('AA5').value.formula, 'IFERROR(Z5/Y5,0)');
});
