'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TEMPLATE_SHEETS, sheetForProcess, safeSheetName, groupReportsByProcessSheet, getProcessDetailTypes } = require('../services/commonProcessExcelGrouping');

test('process sheets preserve fixed legacy names and safe fallback', () => {
  assert.ok(TEMPLATE_SHEETS.includes('Cắt lồng'));
  assert.equal(sheetForProcess('Gia công cắt lồng'), 'Cắt lồng');
  assert.equal(sheetForProcess('Mài'), 'TT Mài');
  assert.equal(safeSheetName('A/B:C'), 'A B C');
  assert.ok(safeSheetName('x'.repeat(40)).length <= 31);
});

test('grouping preserves input order and assigns reports to process sheets', () => {
  const a = { process_name: 'Mài', id: 1 };
  const b = { process_name: 'Cán', id: 2 };
  const c = { process_name: 'Mài', id: 3 };
  const grouped = groupReportsByProcessSheet([a, b, c]);
  assert.deepEqual(grouped.get('TT Mài'), [a, c]);
  assert.deepEqual(grouped.get('CÁN'), [b]);
});

test('catalogs prioritize machine deductions and preserve legacy ID deduplication', () => {
  const items = [{ excelExportTimes: { hasMachine: true, deductions: [
    { deduction_type_id: 2, name: '5S', sort_order: 2 },
    { deduction_type_id: 1, name: 'Chuyển mã', sort_order: 1 }
  ] }, deductions: [{ id: 9, name: 'worker-only' }], defects: [
    { defect_type_id: 3, name: 'NG', sort_order: 1 }
  ] }];
  const { processDeductions, processDefects } = getProcessDetailTypes(items);
  assert.deepEqual(processDeductions.map(x => x.deduction_type_id), [1, 2]);
  assert.equal(processDefects[0].defect_type_id, 3);
});
