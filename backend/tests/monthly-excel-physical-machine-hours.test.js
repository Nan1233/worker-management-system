'use strict';

// Regression coverage for backend/services/monthlyExcelService.js, the legacy
// server-rendered monthly Excel path (/export-excel, syncJobService,
// excelExportWorker). It keeps its own copy of the GC machine-hours
// accounting instead of importing giaCongMachineAccounting.js, so it must be
// checked (and fixed) independently of bulkCompanyExcelDataService.js.

const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../config/db');
const monthlyExcelPath = require.resolve('../services/monthlyExcelService');
const machinePerformancePath = require.resolve('../services/machinePerformanceService');

const YEAR_MONTH = '2026-09';

function buildFakeDb({ reportRows, machineLineRows, eventRows }) {
  function query(sql, params, callback) {
    if (/FROM production_reports AS pr/.test(sql)) return callback(null, reportRows);
    if (/FROM processes WHERE LOWER/.test(sql)) return callback(null, []);
    if (/FROM deduction_types/.test(sql)) return callback(null, []);
    if (/FROM defect_types/.test(sql)) return callback(null, []);
    if (/FROM production_report_deductions/.test(sql)) return callback(null, []);
    if (/FROM production_report_defects/.test(sql)) return callback(null, []);
    if (/FROM production_report_machine_lines WHERE report_id IN/.test(sql)) return callback(null, machineLineRows);
    if (/FROM machine_production_events WHERE status='approved' AND id IN/.test(sql)) return callback(null, eventRows);
    return callback(new Error(`Unexpected SQL in fake db: ${sql}`));
  }
  return { query };
}

function loadService(fakeDb) {
  const savedDb = require.cache[dbPath];
  const savedModules = [monthlyExcelPath, machinePerformancePath].map((p) => [p, require.cache[p]]);
  for (const [p] of savedModules) delete require.cache[p];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };

  const svc = require('../services/monthlyExcelService');
  return {
    svc,
    restore() {
      delete require.cache[monthlyExcelPath];
      for (const [p, mod] of savedModules) {
        if (mod) require.cache[p] = mod; else delete require.cache[p];
      }
      if (savedDb) require.cache[dbPath] = savedDb; else delete require.cache[dbPath];
    }
  };
}

const baseReportRow = (overrides = {}) => ({
  id: 1, worker_id: 1, process_id: 7, work_date: '2026-09-03', shift: 'A',
  operation_mode: 'MACHINE', machine_no: '5', product_name: '5770',
  total_time: 0, actual_time: 0, deduction_time: 0, standard_output: 600,
  actual_output: null, tt_ok: 0, tt_ng: 0, status: 'approved',
  worker_code: '4310', training_percent: 100, position: null, department: null,
  full_name: 'Lo Van Thanh', process_name: 'Gia cong', process_code: 'GC',
  exclude_kqd_from_tt_snapshot: 0, exclude_kqd_from_tt: 0,
  ...overrides
});

test('monthly export: event query excludes unapproved events, so an unapproved linked event does not supply machine hours', async () => {
  const reportRows = [baseReportRow({ id: 201 })];
  const machineLineRows = [{
    id: 1, report_id: 201, sort_order: 1, machine_code: '5', product_code: '5770',
    machine_event_id: 9101, machine_time_hours: 4, deduction_time_hours: 0, deductions_json: '[]'
  }];
  // An unapproved event with this id exists in the DB, but the service's
  // query must filter it out (status='approved'); the fake db only returns
  // rows for the exact approved-filtering query text, so returning [] here
  // simulates "query correctly excluded the unapproved row".
  const eventRows = [];

  const fakeDb = buildFakeDb({ reportRows, machineLineRows, eventRows });
  const { svc, restore } = loadService(fakeDb);
  try {
    const reports = await svc.loadMonthReports(YEAR_MONTH);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].machineAccounting.grossHours, 0);
    assert.notEqual(reports[0].machineAccounting.grossHours, 4,
      'must not silently use the worker-participation machine_time_hours column as physical machine time');
  } finally { restore(); }
});

test('monthly export: approved linked event supplies gross machine hours', async () => {
  const reportRows = [baseReportRow({ id: 202 })];
  const machineLineRows = [{
    id: 2, report_id: 202, sort_order: 1, machine_code: '5', product_code: '5770',
    machine_event_id: 9102, machine_time_hours: 3, deduction_time_hours: 0, deductions_json: '[]'
  }];
  const eventRows = [{ id: 9102, machine_time_hours: 8 }];

  const fakeDb = buildFakeDb({ reportRows, machineLineRows, eventRows });
  const { svc, restore } = loadService(fakeDb);
  try {
    const reports = await svc.loadMonthReports(YEAR_MONTH);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].machineAccounting.grossHours, 8);
  } finally { restore(); }
});

test('monthly export: machine line without any linked event still uses its own machine_time_hours (legacy fallback)', async () => {
  const reportRows = [baseReportRow({ id: 203 })];
  const machineLineRows = [{
    id: 3, report_id: 203, sort_order: 1, machine_code: '5', product_code: '5770',
    machine_event_id: null, machine_time_hours: 6, deduction_time_hours: 0, deductions_json: '[]'
  }];
  const eventRows = [];

  const fakeDb = buildFakeDb({ reportRows, machineLineRows, eventRows });
  const { svc, restore } = loadService(fakeDb);
  try {
    const reports = await svc.loadMonthReports(YEAR_MONTH);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].machineAccounting.grossHours, 6);
  } finally { restore(); }
});
