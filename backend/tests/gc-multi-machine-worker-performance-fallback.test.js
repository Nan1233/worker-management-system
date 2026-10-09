const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateReportPerformance } = require('../services/machinePerformanceService');

// GC multi-machine reports legitimately store actual_time = 0 at the report
// level (see reportValidation.js: isGiaCongMachineReport). The worker
// performance KPI must not show 0 worked hours / 0% efficiency in that case;
// it should fall back to the summed machine_time_hours across machine_lines,
// the same source Excel exports (commonProcessMonthlyExcelService.js,
// companyExcelExportService.js) already use via giaCongMachineAccounting.js.

test('machine-mode report with actual_time = 0 falls back to summed machine hours for worker KPI', () => {
  const performance = calculateReportPerformance({
    report: { operation_mode: 'MACHINE', actual_time: 0, standard_output: 0 },
    machineLines: [
      { machine_time_hours: 8, ok_quantity: 15, ng_quantity: 1, standard_output: 2, maximum_output: 16 },
      { machine_time_hours: 6.5, ok_quantity: 10, ng_quantity: 0, standard_output: 2, maximum_output: 13 },
    ],
  });

  assert.equal(performance.performanceMode, 'MACHINE');
  assert.equal(performance.machinePerformance.total_machine_hours, 14.5);
  assert.equal(performance.workerPerformance.actual_worker_hours, 14.5);
  assert.ok(performance.workerPerformance.efficiency_percent > 0);
});

test('machine-mode report with a real actual_time keeps using the reported value, not machine hours', () => {
  const performance = calculateReportPerformance({
    report: { operation_mode: 'MACHINE', actual_time: 8, standard_output: 0 },
    machineLines: [
      { machine_time_hours: 4, ok_quantity: 10, ng_quantity: 0, standard_output: 2, maximum_output: 8 },
      { machine_time_hours: 4, ok_quantity: 10, ng_quantity: 0, standard_output: 2, maximum_output: 8 },
    ],
  });

  assert.equal(performance.machinePerformance.total_machine_hours, 8);
  assert.equal(performance.workerPerformance.actual_worker_hours, 8);
});

test('manual-mode report keeps using report.actual_time directly (no machine_lines to fall back to)', () => {
  const performance = calculateReportPerformance({
    report: { operation_mode: 'MANUAL', actual_time: 0, tt_ok: 10, tt_ng: 0, standard_output: 5 },
    machineLines: [],
  });

  assert.equal(performance.performanceMode, 'MANUAL');
  assert.equal(performance.workerPerformance.actual_worker_hours, 0);
});
