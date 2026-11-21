'use strict';
// Static regression guard: all KTC process exports must remain present.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PROCESS_SHEETS } = require('../electron/monthlyWorkbookLocal.cjs');

const required = ['GC', 'MAI', 'K1', 'K2', 'CAN', 'EP', 'XLBV', 'DO', 'SX3'];

test('monthly exporter retains all nine production processes', () => {
  for (const code of required) {
    assert.ok(PROCESS_SHEETS[code], 'Missing monthly workbook process: ' + code);
    assert.ok(PROCESS_SHEETS[code].sheet, 'Missing worksheet name: ' + code);
  }
});

test('Desktop Excel IPC API is preserved', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../electron/preload.cjs'), 'utf8');
  for (const method of [
    'saveExcel', 'syncAllExcel', 'previewExcelDbSync', 'applyExcelDbSync',
    'previewReportImport', 'applyReportImport', 'configureAutoSync',
    'openExportFolder', 'getExportFolder', 'getExportRoot',
    'chooseExportRoot', 'resetExportRoot', 'saveStatisticsExcel', 'openLogFolder'
  ]) {
    assert.match(preload, new RegExp('\\b' + method + '\\s*:'), 'Missing desktop IPC method: ' + method);
  }
});

test('export code still includes the monthly workbook path', () => {
  const main = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
  assert.match(main, /buildSplitMonthlyWorkbooksLocal\s*\(/);
  assert.match(main, /PROCESS_SHEETS/);
  assert.match(main, /syncProcessReportsFirst/);
});
