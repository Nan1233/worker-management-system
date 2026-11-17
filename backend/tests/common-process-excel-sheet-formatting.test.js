'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { clearSheetData, applyStyle, captureRowStyles } = require('../services/commonProcessExcelSheetFormatting');

test('Excel template clearing preserves styles and clears existing cell values', () => {
  const cell = { value: 123, style: { numFmt: '0.00' } };
  const sheet = {
    _merges: {}, conditionalFormattings: [{ ref: 'A1' }], columnCount: 54,
    eachRow(_options, fn) { fn({ eachCell(_cellOptions, visit) { visit(cell); } }); },
    getColumn(index) { assert.equal(index, 54); return this.extraColumn; },
    extraColumn: { hidden: false }
  };
  clearSheetData(sheet);
  assert.equal(cell.value, null);
  assert.equal(cell.style.numFmt, '0.00');
  assert.equal(sheet.conditionalFormattings.length, 0);
  assert.equal(sheet.extraColumn.hidden, true);
});

test('Excel template style application clones values instead of sharing mutable objects', () => {
  const source = { style: { font: { bold: true } }, numFmt: '0.00' };
  const cell = {};
  applyStyle(cell, source);
  cell.style.font.bold = false;
  assert.equal(source.style.font.bold, true);
  assert.equal(cell.numFmt, '0.00');
});

test('Excel style capture preserves exactly 53 columns', () => {
  const sheet = { getRow() { return { getCell(column) { return { style: { column }, numFmt: '0.00' }; } }; } };
  const styles = captureRowStyles(sheet, 3);
  assert.equal(styles.length, 53);
  assert.equal(styles[0].style.column, 1);
  assert.equal(styles[52].style.column, 53);
});
