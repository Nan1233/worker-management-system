'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveExportTimes } = require('../electron/exportMachineTime.cjs');

test('machine report uses physical machine accounting instead of worker totals', () => {
  const result = resolveExportTimes({
    operation_mode: 'MACHINE',
    total_time: 8,
    actual_time: 7,
    deduction_time: 1,
    machineAccounting: {
      source: 'MACHINE_EVENT',
      grossHours: 5,
      netHours: 4.5,
      deductionHours: 0.5,
      deductions: [{ deduction_type_id: 3, deduction_name: 'Chỉnh máy', hours: 0.5 }]
    }
  });
  assert.equal(result.hasMachine, true);
  assert.equal(result.totalHours, 5);
  assert.equal(result.actualHours, 4.5);
  assert.equal(result.deductionHours, 0.5);
  assert.equal(result.deductions[0].deduction_type_id, 3);
});

test('machine lines use the physical event time once, not worker participation time', () => {
  const result = resolveExportTimes({
    total_time: 8,
    actual_time: 7,
    deduction_time: 1,
    machineLines: [
      { id: 1, machine_event_id: 90, machine_time_hours: 3, deduction_time_hours: 0.25 },
      { id: 2, machine_event_id: 90, machine_time_hours: 3, deduction_time_hours: 0.25 }
    ],
    eventLines: [{ id: 90, machine_time_hours: 6 }]
  });
  assert.equal(result.totalHours, 6);
  assert.equal(result.deductionHours, 0.25);
  assert.equal(result.actualHours, 5.75);
});

test('machine lines without event use the machine-line time', () => {
  const result = resolveExportTimes({
    total_time: 8,
    actual_time: 7,
    deduction_time: 1,
    machineLines: [{ id: 1, machine_time_hours: 4, deduction_time_hours: 0.5 }]
  });
  assert.equal(result.totalHours, 4);
  assert.equal(result.deductionHours, 0.5);
  assert.equal(result.actualHours, 3.5);
});

test('missing linked physical event does not fall back to worker participation hours', () => {
  const result = resolveExportTimes({
    operation_mode: 'MACHINE',
    total_time: 8,
    actual_time: 7,
    deduction_time: 1,
    machineLines: [{
      id: 1, machine_event_id: 55, machine_time_hours: 7,
      excel_machine_time_hours: 0, deduction_time_hours: 0
    }],
    eventLines: []
  });
  assert.equal(result.totalHours, 0);
  assert.equal(result.actualHours, 0);
});

test('reports without a machine continue to use worker time', () => {
  const result = resolveExportTimes({
    operation_mode: 'MANUAL',
    machine_no: '',
    total_time: 8,
    actual_time: 7,
    deduction_time: 1
  });
  assert.equal(result.hasMachine, false);
  assert.equal(result.totalHours, 8);
  assert.equal(result.actualHours, 7);
  assert.equal(result.deductionHours, 1);
});

test('explicit manual report keeps worker time even if a legacy machine label is present', () => {
  const result = resolveExportTimes({
    operation_mode: 'MANUAL',
    machine_no: 'M-01',
    total_time: 8,
    actual_time: 7.5,
    deduction_time: 0.5,
    deductions: [{ deduction_type_id: 1, deduction_name: '5S', hours: 0.5 }]
  });
  assert.equal(result.hasMachine, false);
  assert.equal(result.totalHours, 8);
  assert.equal(result.actualHours, 7.5);
  assert.equal(result.deductionHours, 0.5);
});

test('machine report with no machine detail does not fall back to worker time', () => {
  const result = resolveExportTimes({
    operation_mode: 'MACHINE',
    machine_no: 'GC01',
    total_time: 8,
    actual_time: 7,
    deduction_time: 1
  });
  assert.equal(result.hasMachine, true);
  assert.equal(result.totalHours, 0);
  assert.equal(result.actualHours, 0);
  assert.equal(result.deductionHours, 0);
});
