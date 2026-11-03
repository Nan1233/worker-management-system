'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { _private } = require('../electron/monthlyWorkbookLocal.cjs');

test('Desktop GC visible report snapshot keeps worker totals, not shared physical event hours', () => {
  const snapshot = _private.reportSnapshot({
    id: 10,
    operation_mode: 'MACHINE',
    total_time: 4,
    actual_time: 3.5,
    deduction_time: 0.5,
    tt_ok: 100,
    tt_ng: 0,
    actual_output: 100,
    standard_output: 25,
    training_percent: 100,
    machineLines: [
      { machine_event_id: 55, machine_time_hours: 2 },
      { machine_event_id: 55, machine_time_hours: 2 }
    ],
    physicalMachineEvents: [{ id: 55, machine_time_hours: 6 }]
  });
  assert.equal(snapshot.workingTime, 4);
  assert.equal(snapshot.actualTime, 3.5);
  assert.equal(snapshot.deductionTime, 0.5);
});

test('Desktop hidden machine-event sheet stores each physical event exactly once', () => {
  const workbook = new ExcelJS.Workbook();
  const event = {
    id: 55,
    work_date: '2026-10-12',
    shift: 'DAY',
    machine_id: 7,
    machine_code: 'GC07',
    product_code: 'SP01',
    physical_ok_quantity: 500,
    physical_ng_quantity: 5,
    physical_counted_output: 505,
    physical_total_output: 505,
    machine_time_hours: 6,
    maximum_output: 600,
    standard_output: 100,
    exclude_kqd_from_tt_snapshot: 1,
    status: 'approved'
  };
  _private.addPhysicalMachineEventsMetadata(workbook, {
    physicalMachineEvents: [event, { ...event }, { ...event, id: 56, machine_time_hours: 2 }]
  });

  const sheet = workbook.getWorksheet('_KTC_MACHINE_EVENTS');
  assert.ok(sheet);
  assert.equal(sheet.state, 'veryHidden');
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.getCell('A2').value, 55);
  assert.equal(sheet.getCell('K2').value, 6);
  assert.equal(sheet.getCell('A3').value, 56);
  assert.equal(sheet.getCell('K3').value, 2);
});
