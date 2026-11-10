'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('function buildApprovedMachineLinesInsert(');
const end=source.indexOf('module.exports = {',start);
assert.ok(start>=0&&end>start);
const calls=[];
const ctx={buildApprovedMachineLineValues:(lines,id)=>{calls.push({lines,id});return ['serialized-values'];}};
vm.runInNewContext(source.slice(start,end),ctx);
const insert=vm.runInNewContext('buildApprovedMachineLinesInsert',ctx);
const read=vm.runInNewContext('buildApprovedMachineLinesRead',ctx);
test('bulk machine line SQL preserves 21-column order and placeholders',()=>{
 const lines=[{id:1},{id:2}];
 const result=insert(lines,17);
 assert.match(result.sql,/INSERT INTO production_report_machine_lines/);
 assert.match(result.sql,/report_id,machine_event_id,machine_id,machine_code,product_standard_id,standard_version_id,machine_standard_id,product_code/);
 assert.match(result.sql,/maximum_output,deduction_time_hours,deductions_json,counted_output,earned_standard_hours,defects_json,sort_order/);
 assert.equal((result.sql.match(/\?/g)||[]).length,42);
 assert.equal((result.sql.match(/\(\?(?:,\?){20}\)/g)||[]).length,2);
 assert.deepEqual(Array.from(result.params),['serialized-values']);
 assert.strictEqual(calls[0].lines,lines);
 assert.equal(calls[0].id,17);
});
test('empty machine-line input preserves builder behavior, while caller skips it',()=>{
 const result=insert([],9);
 assert.match(result.sql,/VALUES $/);
 assert.match(source,/if \(!tempLines.length\) return \{ ids: \[\], rows: \[\] \}/);
});
test('approved machine lines read preserves ordered selection and report id',()=>{
 const result=read('0009');
 assert.equal(result.sql,'SELECT * FROM production_report_machine_lines WHERE report_id=? ORDER BY sort_order ASC, id ASC');
 assert.deepEqual(Array.from(result.params),['0009']);
});
test('copy flow keeps insert, ordered read, verification, defect insert in sequence',()=>{
 const flow=source.slice(source.indexOf('async function copyMachineLinesToApproved('),source.indexOf('function getExtraDataObject('));
 const markers=['buildApprovedMachineLinesInsert(tempLines, approvedReportId)','await query(connection, machineInsertSql, machineInsertParams)','buildApprovedMachineLinesRead(approvedReportId)','await qRows(connection, approvedLinesSql, approvedLinesParams)','verifyApprovedMachineLineCopy(approvedRows, tempLines, tempReportId, approvedReportId)','buildApprovedMachineDefectRows(tempLines, byInsertOrder)','buildApprovedMachineDefectsInsert(pendingDefects)','await query(connection, defectInsertSql, defectInsertParams)'];
 const positions=markers.map(x=>flow.indexOf(x));
 assert.ok(positions.every(x=>x>=0));
 assert.ok(positions.every((x,i)=>i===0||positions[i-1]<x));
});
