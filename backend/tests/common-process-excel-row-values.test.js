'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCommonProcessExcelRowValues } = require('../services/commonProcessExcelRowValues');

test('Excel row values preserve worker identity, hours, production and NG', () => {
  const values = buildCommonProcessExcelRowValues({ worker_code: '599', full_name: 'Worker', shift: 'A',
    total_time: 8, actual_time: 7, deduction_time: 1, actual_output: 100,
    tt_ok: 95, tt_ng: 5, standard_output: 10, training_percent: 100,
    work_date: '2026-11-10' }, [], [], 0);
  assert.equal(values.length, 53);
  assert.equal(values[0], 1);
  assert.equal(values[1], '599');
  assert.equal(values[5], 1);
  assert.equal(values[6], 8);
  assert.equal(values[7], 7);
  assert.equal(values[27], 70);
  assert.equal(values[28], 100);
  assert.equal(values[29], 100 / 70);
  assert.equal(values[33], 5);
});

test('GC Excel detail blocks remain fixed width with empty type catalogs', () => {
  const values = buildCommonProcessExcelRowValues({ process_code: 'GC', actual_output: 10,
    tt_ok: 10, tt_ng: 0, actual_time: 1, standard_output: 10 }, [], [], 0);
  assert.equal(values.length, 53);
  assert.equal(values[25], null);
  assert.equal(values[51], 10);
  assert.equal(values[52], 0);
});


test('non-GC Excel rows keep product and NG totals in template columns with sparse catalogs', () => {
  const values = buildCommonProcessExcelRowValues({ process_code: 'MAI', product_name: 'SP-1',
    actual_output: 20, tt_ok: 18, tt_ng: 2, standard_output: 10,
    excelExportTimes: { totalHours: 2, actualHours: 2, deductionHours: 0, deductions: [] }
  }, [], [], 2);
  assert.equal(values.length, 53);
  assert.equal(values[0], 3);
  assert.equal(values[25], null);
  assert.equal(values[26], 'SP-1');
  assert.equal(values[27], 20);
  assert.equal(values[28], 20);
  assert.equal(values[33], 2);
  assert.equal(values[34], 0.1);
  assert.equal(values[50], null);
  assert.equal(values[51], 18);
  assert.equal(values[52], 2);
});
