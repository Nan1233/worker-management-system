'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveReportExportTimes } = require('../services/commonProcessExportTimes');

test('manual Excel report uses worker times and deductions', () => {
  assert.deepEqual(resolveReportExportTimes({ total_time: 8, actual_time: 7, deduction_time: 1,
    deductions: [{ hours: 1 }] }), {
    hasMachine: false, totalHours: 8, actualHours: 7, deductionHours: 1,
    deductions: [{ hours: 1 }]
  });
});

test('machine accounting snapshot is authoritative for export', () => {
  const times = resolveReportExportTimes({ operation_mode: 'MACHINE', deduction_time: 7,
    machineAccounting: { grossHours: 8, deductionHours: 1, netHours: 7, deductions: [{ deduction_code: 'SETUP', hours: 1 }] } });
  assert.equal(times.totalHours, 8);
  assert.equal(times.deductionHours, 1);
  assert.equal(times.actualHours, 7);
  assert.equal(times.deductions.length, 1);
});

test('legacy shared physical event is counted once, with deductions grouped', () => {
  const line = { machine_event_id: 42, excel_machine_time_hours: 8,
    deductions_json: JSON.stringify([{ deduction_type_id: 3, deduction_code: 'BREAK', hours: 1 }]) };
  const times = resolveReportExportTimes({ machineLines: [line, { ...line }] });
  assert.equal(times.totalHours, 8);
  assert.equal(times.deductionHours, 1);
  assert.equal(times.actualHours, 7);
  assert.equal(times.deductions[0].hours, 1);
});

test('legacy independent machine lines accumulate their physical hours', () => {
  const times = resolveReportExportTimes({ machineLines: [
    { machine_time_hours: 3, adjustment_minutes: 30 },
    { machine_time_hours: 4, deduction_time_hours: 1 }
  ] });
  assert.equal(times.totalHours, 7);
  assert.equal(times.deductionHours, 1.5);
  assert.equal(times.actualHours, 5.5);
});
