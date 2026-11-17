'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dateKey, prepareCommonProcessExcelReports } = require('../services/commonProcessExcelReportPreparation');

test('report preparation sorts dates then worker codes numerically', () => {
  const reports = [
    { id: 3, process_code: 'MAI', worker_code: '10', work_date: '2026-11-11', total_time: 2 },
    { id: 2, process_code: 'MAI', worker_code: '2', work_date: '2026-11-11', total_time: 3 },
    { id: 1, process_code: 'MAI', worker_code: '9', work_date: '2026-11-10', total_time: 4 }
  ];
  const prepared = prepareCommonProcessExcelReports(reports);
  assert.deepEqual(prepared.map(x => x.id), [1, 2, 3]);
  assert.deepEqual(prepared.map(x => x.excelExportTimes.totalHours), [4, 3, 2]);
});

test('report preparation preserves existing export time snapshots', () => {
  const snapshot = { hasMachine: true, totalHours: 8, actualHours: 7, deductionHours: 1, deductions: [] };
  const prepared = prepareCommonProcessExcelReports([{ process_code: 'MAI', excelExportTimes: snapshot }]);
  assert.strictEqual(prepared[0].excelExportTimes, snapshot);
});

test('dateKey preserves ISO calendar dates without UTC conversion', () => {
  assert.equal(dateKey('2026-11-10T23:59:00Z'), '2026-11-10');
  assert.equal(dateKey(''), '');
});
