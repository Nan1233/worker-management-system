'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDeferredDesktopServices } = require('../electron/deferredDesktopServices.cjs');
const { createCompanyExcelMetrics } = require('../electron/companyExcelMetrics.cjs');
const { PROCESS_FILE_PREFIXES: canonicalPrefixes, processWorkbookFileName } =
  require('../electron/monthlyWorkbookNaming.cjs');
const { PROCESS_CODES, PROCESS_FILE_PREFIXES: workerPrefixes, GC_FORM_DEFECT_COLUMN_BY_CODE } =
  require('../electron/workerReportTemplateRegistry.cjs');
const { PROCESS_SHEETS } = require('../electron/monthlyWorkbookSchemas.cjs');

const safeText = value => value == null ? '' : String(value);
const num = value => Number(value) || 0;
const normalizeCode = value => safeText(value).trim().toUpperCase();
const { getMetrics } = createCompanyExcelMetrics({ safeText, num, normalizeCode });

test('canonical process prefixes are shared by monthly and worker exports', () => {
  assert.equal(workerPrefixes, canonicalPrefixes);
  assert.deepEqual(PROCESS_CODES, Object.keys(PROCESS_SHEETS));
  for (const code of PROCESS_CODES) {
    assert.ok(canonicalPrefixes[code], `Missing filename prefix for ${code}`);
    assert.equal(processWorkbookFileName(code, '2026-11-20'), `${canonicalPrefixes[code]}_11-2026.xlsx`);
  }
});

test('GC encoded defect catalogue has independent CUT and LONG buckets', () => {
  assert.equal(Object.keys(GC_FORM_DEFECT_COLUMN_BY_CODE).length, 18);
  for (let i = 1; i <= 10; i += 1) assert.ok(GC_FORM_DEFECT_COLUMN_BY_CODE[`CAT${String(i).padStart(2, '0')}`]);
  for (let i = 1; i <= 8; i += 1) assert.ok(GC_FORM_DEFECT_COLUMN_BY_CODE[`LONG${String(i).padStart(2, '0')}`]);
});

test('shared-machine GC uses worker time, retained standard and physical approved quantity', () => {
  const data = getMetrics({
    process_code: 'GC', operation_mode: 'MACHINE',
    machineLines: [{ machine_time_hours: 5 }, { machine_time_hours: 5 }],
    actual_time: 8, total_time: 9, deduction_time: 1,
    training_percent: 25, training_percent_snapshot: 75,
    standard_output: '6.315789', actual_output: 60, tt_ok: 58,
    defects: [{ quantity: 2 }], deductions: [{ hours: 1, deduction_code: 'CHUYEN_MA' }],
  });
  assert.equal(data.totalTime, 9);
  assert.equal(data.actualTime, 8);
  assert.equal(data.trainingPercent, 75);
  assert.equal(data.actualOutput, 60);
  assert.equal(data.deductionTotal, 1);
  assert.equal(data.standardOutput, 6.315789);
  assert.equal(data.changeCount, 1);
  assert.equal(data.ngRate, 2 / 60);
});

test('desktop service graph fails clearly before bind and disallows rebinding', () => {
  const graph = createDeferredDesktopServices(['fetch', 'sync']);
  assert.throws(() => graph.call('fetch'), /not initialized/);
  graph.bind('fetch', value => value + 1);
  assert.equal(graph.call('fetch', 2), 3);
  assert.throws(() => graph.assertReady(), /sync/);
  graph.bind('sync', () => true);
  assert.doesNotThrow(() => graph.assertReady());
  assert.equal(graph.call('sync'), true);
  assert.throws(() => graph.bind('sync', () => false), /already bound/);
  assert.throws(() => graph.bind('unknown', () => false), /Unknown/);
});
