'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getProcessMachineRule, validateFactoryMachineRules } = require('../services/factoryMachineRuleService');
const { validateProductionReport } = require('../utils/reportValidation');

const rows = ['C1','C2','C3','C4','C5'].map((machine_code,id)=>({
  id:id+1, process_id:1, machine_code, is_automatic: machine_code==='C5'?1:0,
  max_workers_per_machine:1, output_basis:machine_code==='C5'?'MACHINE':'PRODUCT'
}));
const line = (machine_code) => ({machine_code, product_code:'P1', machine_time_hours:8, ok_quantity:10, ng_quantity:0});

test('F04 GC permits four unique machines per worker and refuses five', async () => {
  const four = await validateFactoryMachineRules({processCode:'GC',processId:1,machineLines:rows.slice(0,4).map(r=>line(r.machine_code)),machineRows:rows});
  assert.equal(four.valid,true,JSON.stringify(four.errors));
  const five = await validateFactoryMachineRules({processCode:'GC',processId:1,machineLines:rows.map(r=>line(r.machine_code)),machineRows:rows});
  assert.equal(five.valid,false);
  assert.match(five.errors.machine_lines,/tối đa 4 máy/);
});

test('F04 machine type and output basis come from master rows', () => {
  assert.equal(getProcessMachineRule('GC','C5',rows[4]).automatic,true);
  assert.equal(getProcessMachineRule('GC','C5',rows[4]).outputBasis,'MACHINE');
  assert.equal(getProcessMachineRule('GC','C1',rows[0]).outputBasis,'PRODUCT');
});

test('F04 GC machine report can derive hours from lines rather than report-level actual_time', () => {
  const payload = {
    process_id:1, work_date:'2026-11-11', shift:'A', machine_no:'C5',
    product_name:'P1', operation_mode:'MACHINE', total_time:0, actual_time:0,
    deduction_time:0, standard_output:10, actual_output:0, tt_ok:0, tt_ng:0,
    defects:[], deductions:[], training_percent:100, machine_lines:[line('C5')]
  };
  const result=validateProductionReport(payload,{skipActualOutputFormula:true});
  assert.equal(result.valid,true,JSON.stringify(result.errors));
});
