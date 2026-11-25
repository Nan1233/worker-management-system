'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { projectGcMachineRows, rowIdentityKey, validateGcPhysicalEvents } = require('../electron/gcMachineExportRows.cjs');
const line = (id, machine_code) => ({id,report_id:11,machine_code,product_code:'P1',ok_quantity:20,ng_quantity:1,machine_time_hours:4,standard_output:100,machine_event_id:id+100});
const report = () => ({id:11,operation_mode:'MACHINE',machine_no:'M1,M2',work_date:'2026-11-01',shift:'A',machineLines:[line(1,'M1'),line(2,'M2')]});

test('GC machine projections retain approved lineage and per-line quantities', () => {
  const original=report();
  const rows=projectGcMachineRows([original]);
  assert.deepEqual(rows.map(rowIdentityKey),['machine:11:1','machine:11:2']);
  assert.deepEqual(rows.map(row=>[row.tt_ok,row.tt_ng,row.machine_no,row.excelReadOnly]),[[20,1,'M1',true],[20,1,'M2',true]]);
  assert.equal(original.machineLines.length,2);
});
test('GC refuses incomplete or duplicate machine lines', () => {
  const duplicate=report();duplicate.machineLines[1].id=1;
  assert.throws(()=>projectGcMachineRows([duplicate]),{code:'GC_EXPORT_SPLIT_REQUIRED'});
  const incomplete=report();delete incomplete.machineLines[0].ok_quantity;
  assert.throws(()=>projectGcMachineRows([incomplete]),{code:'GC_EXPORT_SPLIT_REQUIRED'});
});
test('physical event identity must match worker machine, day and shift', () => {
  const event={id:101,machine_code:'M1',work_date:'2026-11-01',shift:'A',machine_time_hours:4,status:'APPROVED'};
  assert.doesNotThrow(()=>validateGcPhysicalEvents({reports:[report()],physicalMachineEvents:[event]},'2026-11'));
  assert.throws(()=>validateGcPhysicalEvents({reports:[report()],physicalMachineEvents:[{...event,shift:'B'}]},'2026-11'),{code:'EXCEL_MACHINE_EVENT_INVALID'});
  assert.throws(()=>validateGcPhysicalEvents({reports:[report()],physicalMachineEvents:[event,event]},'2026-11'),{code:'EXCEL_MACHINE_EVENT_INVALID'});
});
