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
    tt_ok: 60,
    tt_ng: 2,
    actual_output: 62,
    standard_output: 25,
    training_percent: 100,
    machineLines: [
      { machine_event_id: 55, machine_time_hours: 2 },
      { machine_event_id: 55, machine_time_hours: 2 }
    ],
    physicalMachineEvents: [{
      id: 55,
      machine_time_hours: 6,
      physical_ok_quantity: 500,
      physical_ng_quantity: 5,
      physical_counted_output: 505,
      physical_total_output: 505
    }]
  });
  assert.equal(snapshot.workingTime, 4);
  assert.equal(snapshot.actualTime, 3.5);
  assert.equal(snapshot.deductionTime, 0.5);
  assert.equal(snapshot.ok, 60);
  assert.equal(snapshot.ng, 2);
  assert.equal(snapshot.output, 62);
  assert.notEqual(snapshot.output, 505);
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
    physicalMachineEvents: [event, { ...event }, { ...event, id: 56, machine_time_hours: 2 }],
    reports: [
      { machineLines: [{
        machine_event_id: 55,
        deduction_time_hours: 0.5,
        deductions_json: JSON.stringify([{ deduction_type_id: 7, deduction_code: 'STOP', deduction_name: 'Dừng máy', hours: 0.5 }])
      }] },
      { machineLines: [{
        machine_event_id: 55,
        deduction_time_hours: 0.5,
        deductions_json: JSON.stringify([{ deduction_type_id: 7, deduction_code: 'STOP', deduction_name: 'Dừng máy', hours: 0.5 }])
      }] },
      { machineLines: [{ machine_event_id: 56, deduction_time_hours: 0.25, deductions_json: '[]' }] },
      { machineLines: [{ machine_event_id: 56, deduction_time_hours: 0.5, deductions_json: '[]' }] }
    ]
  });

  const sheet = workbook.getWorksheet('_KTC_MACHINE_EVENTS');
  assert.ok(sheet);
  assert.equal(sheet.state, 'veryHidden');
  assert.equal(sheet.rowCount, 3);
  assert.equal(sheet.getCell('A2').value, 55);
  assert.equal(sheet.getCell('G2').value, 500);
  assert.equal(sheet.getCell('H2').value, 5);
  assert.equal(sheet.getCell('I2').value, 505);
  assert.equal(sheet.getCell('J2').value, 505);
  assert.equal(sheet.getCell('K2').value, 6);
  assert.equal(sheet.getCell('A3').value, 56);
  assert.equal(sheet.getCell('K3').value, 2);
  assert.equal(sheet.getCell('P2').value, 0.5);
  assert.match(sheet.getCell('Q2').value, /STOP/);
  assert.equal(sheet.getCell('R2').value, 'RECORDED_ONCE');
  assert.equal(sheet.getCell('P3').value, null);
  assert.equal(sheet.getCell('R3').value, 'CONFLICTING_PARTICIPANT_LINES');
});

test('Desktop NG metrics preserve approved total NG while excluding configured KQD from counted NG', () => {
  const report = {
    tt_ok: 90,
    tt_ng: 10,
    actual_output: 96,
    exclude_kqd_from_tt_snapshot: 1,
    defects: [
      { defect_code: 'BAVIA', quantity: 6 },
      { defect_code: 'KQD', quantity: 4 }
    ]
  };

  const snapshot = _private.reportSnapshot(report);
  assert.equal(snapshot.ng, 10, 'visible total NG remains the approved DB snapshot');
  assert.equal(_private.countedNg(report), 6, 'KQD is excluded from counted NG');
  assert.equal(snapshot.output, 96, 'approved actual output is not recalculated');
});

test('Desktop GC MACHINE monthly snapshot derives Worker credit from machine lines, not zero parent fields or shared physical hours', () => {
  const snapshot = _private.reportSnapshot({
    id: 77,
    process_code: 'GC',
    operation_mode: 'MACHINE',
    total_time: 0,
    actual_time: 0,
    deduction_time: 0,
    actual_output: 0,
    tt_ok: 0,
    tt_ng: 0,
    standard_output: 0,
    training_percent_snapshot: 50,
    exclude_kqd_from_tt_snapshot: 1,
    machineLines: [
      {
        id: 701,
        machine_event_id: 9001,
        machine_time_hours: 2,
        excel_machine_time_hours: 9,
        deduction_time_hours: 0.5,
        ok_quantity: 100,
        ng_quantity: 10,
        standard_output: 80,
        exclude_kqd_from_tt: 1,
        defects: [
          { defect_code: 'BAVIA', quantity: 6 },
          { defect_code: 'KQD', quantity: 4 }
        ]
      },
      {
        id: 702,
        machine_event_id: 9001,
        machine_time_hours: 3,
        excel_machine_time_hours: 9,
        deduction_time_hours: 0,
        ok_quantity: 120,
        ng_quantity: 0,
        standard_output: 100,
        exclude_kqd_from_tt: 1,
        defects: []
      }
    ],
    physicalMachineEvents: [{
      id: 9001,
      machine_time_hours: 9,
      physical_counted_output: 900
    }]
  });

  assert.equal(snapshot.workingTime, 5, 'sum Worker participation time from the two machine lines');
  assert.equal(snapshot.deductionTime, 0.5);
  assert.equal(snapshot.actualTime, 4.5, 'Worker worked time is participation less Worker deductions');
  assert.equal(snapshot.ok, 220);
  assert.equal(snapshot.ng, 10, 'all Worker NG remains visible');
  assert.equal(snapshot.countedNg, 6, 'KQD is excluded only from counted NG');
  assert.equal(snapshot.enteredOutput, 230);
  assert.equal(snapshot.output, 226);
  assert.equal(snapshot.standard, 210 / 4.5, 'line standards are weighted by Worker worked time and training snapshot');
  assert.equal(snapshot.outputPerHour, 226 / 4.5);
  assert.equal(snapshot.achievement, 226 / 210);
  assert.notEqual(snapshot.workingTime, 9, 'shared physical event hours must not replace Worker participation hours');
  assert.notEqual(snapshot.output, 900, 'shared physical event output must not replace Worker credit');
});

test('Desktop GC MACHINE monthly workbook reads Worker deduction details from each machine line', () => {
  const report = {
    process_code: 'GC',
    operation_mode: 'MACHINE',
    deductions: [],
    machineLines: [
      {
        id: 801,
        deductions_json: JSON.stringify([
          { deduction_type_id: 88, deduction_code: 'STOP', deduction_name: 'Dừng máy của công nhân', hours: 0.5 }
        ])
      },
      {
        id: 802,
        deductions_json: JSON.stringify([
          { deduction_type_id: 88, deduction_code: 'STOP', deduction_name: 'Dừng máy của công nhân', hours: 0.25 }
        ])
      }
    ]
  };

  const details = _private.reportDetailItems(report, 'GC', 'deduction');
  assert.equal(details.length, 2);
  assert.equal(details.reduce((sum, item) => sum + item.hours, 0), 0.75);

  const types = _private.processDetailTypes('GC', { reports: [report] }, 'deductionTypes', 'deductions', 'deduction');
  assert.ok(types.some((item) => item.aliases.includes('id:88')));
});
