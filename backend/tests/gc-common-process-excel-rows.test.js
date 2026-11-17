'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { expandGiaCongMachineLines } = require('../services/gcCommonProcessExcelRows');

test('GC Excel expands one worker row per machine line without repeating report totals', () => {
  const reports = [{ id: 1, process_code: 'GC', actual_output: 999, machineAccounting: { grossHours: 8 },
    machineLines: [
      { id: 2, sort_order: 2, machine_code: 'M2', machine_time_hours: 4, ok_quantity: 6, ng_quantity: 1, deduction_time_hours: 0.5 },
      { id: 1, sort_order: 1, machine_code: 'M1', machine_time_hours: 3, ok_quantity: 5, ng_quantity: 2, adjustment_minutes: 60 }
    ] }];
  const rows = expandGiaCongMachineLines(reports);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(x => x.machine_no), ['M1', 'M2']);
  assert.deepEqual(rows.map(x => x.actual_output), [7, 7]);
  assert.deepEqual(rows.map(x => x.excelExportTimes.totalHours), [3, 4]);
  assert.deepEqual(rows.map(x => x.excelExportTimes.actualHours), [2, 3.5]);
  assert.ok(rows.every(x => x.machineAccounting === null && x.machineLines.length === 0));
});

test('GC Excel preserves manual and other-process reports without fabricated machine lines', () => {
  const manual = { id: 1, process_code: 'GC', actual_output: 10 };
  const other = { id: 2, process_code: 'MAI', machineLines: [{ machine_code: 'M1' }] };
  const rows = expandGiaCongMachineLines([manual, other]);
  assert.strictEqual(rows[0], manual);
  assert.strictEqual(rows[1], other);
});

test('GC Excel worker rows do not substitute physical event hours for participation hours', () => {
  const rows = expandGiaCongMachineLines([{ process_code: 'GC', machineLines: [
    { machine_event_id: 8, excel_machine_time_hours: 12, machine_time_hours: 3, ok_quantity: 1, ng_quantity: 0 }
  ] }]);
  assert.equal(rows[0].excelExportTimes.totalHours, 3);
});
