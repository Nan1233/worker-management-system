'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildGcWorkerRows } = require('../services/gcWorkerReportRows');
const { buildGiaCongMachineAccounting } = require('../services/giaCongMachineAccounting');

const breakDetail = [{ deduction_type_id: 13, deduction_type_code: 'NGHI_GIAI_LAO', deduction_name: 'Nghỉ giải lao', hours: 1.17 }];

test('single machine line safely reuses persisted report-level deduction details', () => {
  const report = {
    id: 780005,
    operation_mode: 'MACHINE',
    deduction_time: 1.17,
    deductions: breakDetail,
    machineLines: [{
      id: 510005,
      machine_code: 'GC01',
      machine_time_hours: 8,
      deduction_time_hours: 0,
      deductions_json: null,
      standard_output: 100
    }]
  };

  const rows = buildGcWorkerRows(report);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].deductions, [{
    deduction_type_id: 13,
    deduction_code: 'NGHI_GIAI_LAO',
    deduction_name: 'Nghỉ giải lao',
    hours: 1.17
  }]);
  assert.equal(rows[0].deductionHours, 1.17);

  const accounting = buildGiaCongMachineAccounting(report, new Map());
  assert.equal(accounting.deductionHours, 1.17);
  assert.equal(accounting.deductions.length, 1);
  assert.equal(accounting.deductions[0].hours, 1.17);
});

test('report-level deductions are not copied to multiple machine lines', () => {
  const report = {
    id: 10,
    operation_mode: 'MACHINE',
    deduction_time: 1.17,
    deductions: breakDetail,
    machineLines: [
      { id: 1, machine_code: 'GC01', machine_time_hours: 4, deduction_time_hours: 0, deductions_json: null },
      { id: 2, machine_code: 'GC02', machine_time_hours: 4, deduction_time_hours: 0, deductions_json: null }
    ]
  };

  const rows = buildGcWorkerRows(report);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.deductions), [[], []]);
  assert.ok(rows[0].warnings.includes('REPORT_DEDUCTIONS_NOT_ALLOCATED_TO_MULTIPLE_MACHINE_LINES'));
  assert.equal(rows.reduce((sum, row) => sum + row.deductionHours, 0), 0);

  const accounting = buildGiaCongMachineAccounting(report, new Map());
  assert.equal(accounting.deductions.length, 0);
  assert.equal(accounting.deductionHours, 0);
});

test('machine-line details take precedence over report-level aggregate details', () => {
  const report = {
    id: 11,
    operation_mode: 'MACHINE',
    deductions: [{ ...breakDetail[0], hours: 99 }],
    machineLines: [{
      id: 3,
      machine_code: 'GC01',
      machine_time_hours: 8,
      deduction_time_hours: 0.5,
      deductions_json: JSON.stringify([{ ...breakDetail[0], hours: 0.5 }])
    }]
  };

  const rows = buildGcWorkerRows(report);
  assert.equal(rows[0].deductionHours, 0.5);
  assert.equal(rows[0].deductions[0].hours, 0.5);
});
