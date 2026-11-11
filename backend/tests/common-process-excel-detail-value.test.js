'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detailValue } = require('../services/commonProcessExcelDetailValue');

test('Excel deduction detail sums repeated matching IDs', () => {
  const items = [{ deduction_type_id: 7, deduction_name: 'Chuyển mã', hours: 0.5 },
    { deduction_type_id: 7, deduction_name: 'Chuyển mã', hours: 0.25 },
    { deduction_type_id: 8, deduction_name: '5S', hours: 1 }];
  assert.equal(detailValue(items, 7, 'Chuyển mã', 'hours'), 0.75);
  assert.equal(detailValue(items, null, 'Chuyển mã', 'hours'), 0.75);
});

test('Excel defect detail supports normalized name and legacy quantity fields', () => {
  const items = [{ defect_type_id: 3, defect_name: 'Xước do lồng', quantity: 2 },
    { defect_type_id: 3, defect_name: 'Xước do lồng', quantity: 4 },
    { defect_type_id: 4, defect_name: 'Cong gãy', quantity: 1 }];
  assert.equal(detailValue(items, 3, 'Xước do lồng', 'quantity'), 6);
  assert.equal(detailValue(items, null, 'Cong gãy', 'quantity'), 1);
  assert.equal(detailValue(items, null, 'Không tồn tại', 'quantity'), 0);
});
