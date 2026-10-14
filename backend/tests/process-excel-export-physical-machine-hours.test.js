'use strict';

// Regression coverage for the per-process Excel export path
// (backend/services/processExcelExportService.js -> POST /export-excel/process,
// used by monthlyExcelService.js's legacy/company exports too). This path
// loads machineLines directly from production_report_machine_lines without
// going through bulkCompanyExcelDataService.js, so it needs its own
// excel_machine_time_hours computation before buildGiaCongMachineAccounting
// runs, or it silently falls back to the worker-participation machine_time_hours
// column whenever a linked physical event is missing or not approved.

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../config/db');
const schemaCompatibilityPath = require.resolve('../services/schemaCompatibilityService');
const processExportPath = require.resolve('../services/processExcelExportService');
const giaCongAccountingPath = require.resolve('../services/giaCongMachineAccounting');
const trainingSnapshotPath = require.resolve('../services/trainingSnapshotService');
const machinePerformancePath = require.resolve('../services/machinePerformanceService');
const templateDrivenPath = require.resolve('../services/templateDrivenProcessExcelExportService');

const PROCESS_ID = 7;
const YEAR_MONTH = '2026-09';

function buildFakeDb({ reportRows, machineLineRows, eventRows }) {
  const state = { queries: [] };

  function query(sql, params, callback) {
    state.queries.push(sql);
    if (/FROM production_reports AS pr/.test(sql)) {
      return callback(null, reportRows);
    }
    if (/FROM machine_production_events e/.test(sql)) {
      return callback(null, eventRows);
    }
    if (/FROM deduction_types WHERE process_id/.test(sql)) {
      return callback(null, []);
    }
    if (/FROM defect_types WHERE process_id/.test(sql)) {
      return callback(null, []);
    }
    if (/FROM production_report_deductions/.test(sql)) {
      return callback(null, []);
    }
    if (/FROM production_report_defects/.test(sql)) {
      return callback(null, []);
    }
    if (/FROM production_report_machine_lines WHERE report_id IN/.test(sql)) {
      return callback(null, machineLineRows);
    }
    return callback(new Error(`Unexpected SQL in fake db: ${sql}`));
  }

  return {
    state,
    fake: {
      query,
      promise() {
        return {
          async query(sql) {
            // hasColumn() INFORMATION_SCHEMA lookups: report both optional
            // columns as present so the main SELECT shape above stays stable.
            if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql)) return [[{ found: 1 }]];
            throw new Error(`Unexpected promise SQL in fake db: ${sql}`);
          }
        };
      }
    }
  };
}

function loadService(fakeDb) {
  const savedDb = require.cache[dbPath];
  const savedModules = [
    schemaCompatibilityPath,
    processExportPath,
    giaCongAccountingPath,
    trainingSnapshotPath,
    machinePerformancePath,
    templateDrivenPath
  ].map((p) => [p, require.cache[p]]);

  for (const [p] of savedModules) delete require.cache[p];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

  const svc = require('../services/processExcelExportService');
  return {
    svc,
    restore() {
      delete require.cache[processExportPath];
      for (const [p, mod] of savedModules) {
        if (mod) require.cache[p] = mod; else delete require.cache[p];
      }
      if (savedDb) require.cache[dbPath] = savedDb; else delete require.cache[dbPath];
    }
  };
}

const baseReportRow = (overrides = {}) => ({
  id: 1, source_temp_id: null, worker_id: 1, process_id: PROCESS_ID,
  work_date: '2026-09-03', entry_date: '2026-09-03', shift: 'A', operation_type: 'GC',
  operation_mode: 'MACHINE', machine_no: '5', product_name: '5770',
  total_time: 0, actual_time: 0, deduction_time: 0,
  standard_output: 600, actual_output: null, tt_ok: 0, tt_ng: 0,
  note: null, extra_data: null, status: 'approved', review_note: null,
  reviewed_by: null, approved_at: '2026-09-03', created_at: '2026-09-03', updated_at: '2026-09-03',
  worker_code: '4310', worker_training_percent: 100,
  training_percent_snapshot: 100, training_percent: 100,
  position: null, department: null,
  full_name: 'Lo Van Thanh', process_name: 'Gia cong', process_code: 'GC',
  exclude_kqd_from_tt_snapshot: 0, exclude_kqd_from_tt: 0,
  ...overrides
});

test('process export: approved linked physical event supplies gross machine hours, not worker participation time', async () => {
  const reportRows = [baseReportRow({ id: 101 })];
  const machineLineRows = [{
    id: 1, report_id: 101, sort_order: 1, machine_code: '5', product_code: '5770',
    machine_event_id: 9001, machine_time_hours: 3, deduction_time_hours: 0,
    deductions_json: '[]', ok_quantity: 0, ng_quantity: 0, standard_output: 600, maximum_output: 0
  }];
  const eventRows = [{ id: 9001, process_id: PROCESS_ID, machine_id: 1, machine_code: '5', product_code: '5770',
    work_date: '2026-09-03', shift: 'A', machine_time_hours: 8, status: 'approved' }];

  const { fake } = buildFakeDb({ reportRows, machineLineRows, eventRows });
  const { svc, restore } = loadService(fake);
  try {
    const reports = await svc.loadProcessMonthReports(YEAR_MONTH, PROCESS_ID);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].machineAccounting.grossHours, 8);
    assert.equal(reports[0].machineAccounting.source, 'MACHINE_EVENT');
  } finally { restore(); }
});

test('process export: linked event missing or unapproved does not fall back to worker participation time', async () => {
  const reportRows = [baseReportRow({ id: 102 })];
  const machineLineRows = [
    { id: 2, report_id: 102, sort_order: 1, machine_code: '5', product_code: '5770',
      machine_event_id: 9002, machine_time_hours: 3, deduction_time_hours: 0,
      deductions_json: '[]', ok_quantity: 0, ng_quantity: 0, standard_output: 600, maximum_output: 0 },
    { id: 3, report_id: 102, sort_order: 2, machine_code: '5', product_code: '5770',
      machine_event_id: 9002, machine_time_hours: 5, deduction_time_hours: 0,
      deductions_json: '[]', ok_quantity: 0, ng_quantity: 0, standard_output: 600, maximum_output: 0 }
  ];
  // Event 9002 is intentionally absent (not approved / does not exist), matching
  // the `WHERE e.status='approved'` filter in the real query.
  const eventRows = [];

  const { fake } = buildFakeDb({ reportRows, machineLineRows, eventRows });
  const { svc, restore } = loadService(fake);
  try {
    const reports = await svc.loadProcessMonthReports(YEAR_MONTH, PROCESS_ID);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].machineAccounting.grossHours, 0);
    assert.notEqual(reports[0].machineAccounting.grossHours, 8,
      'must not silently sum the two workers\' 3h + 5h participation time as machine hours');
  } finally { restore(); }
});

test('process export: machine line without any linked event still uses its own machine_time_hours (legacy fallback)', async () => {
  const reportRows = [baseReportRow({ id: 103 })];
  const machineLineRows = [{
    id: 4, report_id: 103, sort_order: 1, machine_code: '5', product_code: '5770',
    machine_event_id: null, machine_time_hours: 6, deduction_time_hours: 0,
    deductions_json: '[]', ok_quantity: 0, ng_quantity: 0, standard_output: 600, maximum_output: 0
  }];
  const eventRows = [];

  const { fake } = buildFakeDb({ reportRows, machineLineRows, eventRows });
  const { svc, restore } = loadService(fake);
  try {
    const reports = await svc.loadProcessMonthReports(YEAR_MONTH, PROCESS_ID);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].machineAccounting.grossHours, 6);
    assert.equal(reports[0].machineAccounting.source, 'MACHINE_LINE');
  } finally { restore(); }
});
