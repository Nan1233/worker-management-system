'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('function buildApprovedVersionRequest(');
const end=source.indexOf('function buildApprovedParentInsertQuery(',start);
assert.ok(start>=0&&end>start);
const calls=[];
const ctx={buildApprovedVersionPreloaded:(lines,defects,deductions)=>{calls.push([lines,defects,deductions]);return {machineLines:lines,defects,deductions};}};
vm.runInNewContext(source.slice(start,end),ctx);
const build=vm.runInNewContext('buildApprovedVersionRequest',ctx);
test('approved version request preserves report id, reason and reviewer identity',()=>{
 const result=build({id:91},101,7,[],[],[]);
 assert.equal(result.reportId,101);
 assert.equal(result.reason,'Tạo từ báo cáo tạm #91');
 assert.equal(result.userId,7);
});
test('version preload preserves machine, defect and deduction object identities',()=>{
 const lines=[{id:1}],defects=[{id:2}],deductions=[{id:3}];
 const result=build({id:4},8,9,lines,defects,deductions);
 assert.strictEqual(result.preloaded.machineLines,lines);
 assert.strictEqual(result.preloaded.defects,defects);
 assert.strictEqual(result.preloaded.deductions,deductions);
 assert.deepEqual(calls.at(-1),[lines,defects,deductions]);
});
test('request does not coerce identifiers or mutate caller inputs',()=>{
 const item={id:'0005'},lines=[],defects=[],deductions=[];
 const result=build(item,'007','09',lines,defects,deductions);
 assert.strictEqual(result.reportId,'007');
 assert.strictEqual(result.userId,'09');
 assert.equal(result.reason,'Tạo từ báo cáo tạm #0005');
 assert.deepEqual(item,{id:'0005'});
});
test('approved version is created after legacy snapshot before temp status update',()=>{
 const flow=source.slice(source.indexOf('async approveSelected('),source.indexOf('async rejectSelected('));
 const markers=['createLegacyApprovedSnapshot(item','buildApprovedVersionRequest(item, approvedReportId, reviewerId, approvedMachineLines, approvedDefects, approvedDeductions)','buildApprovedTempTransitionQuery(item, reviewerId)'];
 const indices=markers.map(x=>flow.indexOf(x));
 assert.ok(indices.every(x=>x>=0),JSON.stringify(indices));
 assert.ok(indices.every((x,i)=>i===0||indices[i-1]<x));
});
