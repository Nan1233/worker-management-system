'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { buildWorkerProcessWorkbook } = require('../electron/workerReportTemplateLocal.v2.cjs');

test('worker export stores submitted_at in its hidden audit column, separately from work_date', async () => {
  const workDate = '2026-11-01';
  const built = await buildWorkerProcessWorkbook({
    appPath: path.resolve(__dirname, '..', '..'),
    date: workDate,
    processCode: 'CAN',
    processName: 'Cán',
    processData: {
      reports: [{
        id: 91001,
        process_code: 'CAN',
        worker_code: 'AUDIT-TEST',
        full_name: 'Audit Test',
        work_date: workDate,
        submitted_at: '2026-11-02 08:09:10',
        shift: 'A',
        actual_time: 1,
        total_time: 1,
        standard_output: 0,
        actual_output: 0,
        tt_ok: 0,
        tt_ng: 0,
        deductions: [],
        defects: []
      }]
    }
  });
  assert.ok(built.buffer);
  const auditColumn = built.columnContract?.cols?.submittedAt;
  assert.ok(auditColumn, 'submission audit column must exist in export contract');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(built.buffer);
  const sheet = workbook.worksheets.find(item => item.state !== 'hidden') || workbook.worksheets[0];
  assert.ok(sheet.getColumn(auditColumn).hidden, 'audit timestamp column must remain hidden');
  const values = [];
  sheet.eachRow(row => {
    const value = row.getCell(auditColumn).value;
    if (value instanceof Date) values.push(value);
  });
  assert.ok(values.some(value => value.toISOString() === '2026-11-02T08:09:10.000Z'),
    'submitted_at must be retained as Vietnam wall-clock time');
});
