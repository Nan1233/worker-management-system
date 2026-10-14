'use strict';
// GC machine-mode reports no longer carry a worker-entered actual_time
// (reportValidation.js: isGiaCongMachineReport). calculateReportPerformance()
// must still produce a meaningful actual_worker_hours/efficiency figure for
// KPI purposes, derived from the sum of machine_lines[].machine_time_hours,
// matching the pattern already used by giaCongMachineAccounting.js and the
// Excel export services for the same GC machine-mode reports.
const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateReportPerformance } = require('../services/machinePerformanceService');

test('machine-mode report with actual_time=0 falls back to summed machine_time_hours', () => {
  const report = { operation_mode: 'MACHINE', actual_time: 0 };
  const machineLines = [
    { machine_time_hours: 4, ok_quantity: 10, ng_quantity: 0, standard_output: 5 },
    { machine_time_hours: 6, ok_quantity: 15, ng_quantity: 0, standard_output: 5 },
  ];
  const result = calculateReportPerformance({ report, machineLines });
  assert.equal(result.performanceMode, 'MACHINE');
  assert.equal(result.machinePerformance.total_machine_hours, 10);
  assert.equal(result.workerPerformance.actual_worker_hours, 10);
});

test('machine-mode report with a real actual_time keeps using the reported value (not the machine total)', () => {
  const report = { operation_mode: 'MACHINE', actual_time: 8 };
  const machineLines = [
    { machine_time_hours: 4, ok_quantity: 10, ng_quantity: 0, standard_output: 5 },
    { machine_time_hours: 6, ok_quantity: 15, ng_quantity: 0, standard_output: 5 },
  ];
  const result = calculateReportPerformance({ report, machineLines });
  assert.equal(result.workerPerformance.actual_worker_hours, 8);
});

test('manual-mode report (no machine lines) keeps using report.actual_time directly, unaffected by the fallback', () => {
  const report = { operation_mode: 'MANUAL', actual_time: 7.5, tt_ok: 10, tt_ng: 0, standard_output: 5 };
  const result = calculateReportPerformance({ report, machineLines: [] });
  assert.equal(result.performanceMode, 'MANUAL');
  assert.equal(result.workerPerformance.actual_worker_hours, 7.5);
});
