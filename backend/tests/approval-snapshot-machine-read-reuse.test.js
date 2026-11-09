'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const begin=source.indexOf('function buildApprovedMachineLinesRead(');
const end=source.indexOf('module.exports = {',begin);
assert.ok(begin>=0&&end>begin);
const ctx={};
vm.runInNewContext(source.slice(begin,end),ctx);
const read=vm.runInNewContext('buildApprovedMachineLinesRead',ctx);
test('legacy and copy paths share one ordered approved machine line read builder',()=>{
 const copy=source.slice(source.indexOf('async function copyMachineLinesToApproved('),source.indexOf('function getExtraDataObject('));
 const legacy=source.slice(source.indexOf('async function createLegacyApprovedSnapshot('),source.indexOf('// Preserve the positional values'));
 assert.match(copy,/buildApprovedMachineLinesRead\(approvedReportId\)/);
 assert.match(legacy,/readLegacySnapshotRows\(connection, buildApprovedMachineLinesRead\(approvedReportId\)\)/);
 assert.equal((source.match(/SELECT \* FROM production_report_machine_lines WHERE report_id=\? ORDER BY sort_order ASC, id ASC/g)||[]).length,1);
});
test('machine-line read contract preserves SQL and exact report id',()=>{
 const value=read('00023');
 assert.equal(value.sql,'SELECT * FROM production_report_machine_lines WHERE report_id=? ORDER BY sort_order ASC, id ASC');
 assert.deepEqual(Array.from(value.params),['00023']);
});
test('preloaded machine lines bypass SQL and remain unchanged',()=>{
 const legacy=source.slice(source.indexOf('async function createLegacyApprovedSnapshot('),source.indexOf('// Preserve the positional values'));
 assert.match(legacy,/const preloadedMachineLines = preloaded\.machineLines \|\| null/);
 assert.match(legacy,/Array\.isArray\(preloadedMachineLines\)\s*\?\s*preloadedMachineLines\s*:\s*await readLegacySnapshotRows/);
});
test('legacy snapshot reads stay sequential before v1 serialization and upsert',()=>{
 const legacy=source.slice(source.indexOf('async function createLegacyApprovedSnapshot('),source.indexOf('// Preserve the positional values'));
 const markers=['buildLegacySnapshotDefectsRead(approvedReportId)','buildLegacySnapshotDeductionsRead(approvedReportId)','buildApprovedMachineLinesRead(approvedReportId)','JSON.stringify(buildLegacyApprovedSnapshotPayload(','buildLegacySnapshotInsert(item, approvedReportId, reviewerId, snapshotData)','await query(connection, snapshotSql, snapshotParams)'];
 const positions=markers.map(x=>legacy.indexOf(x));
 assert.ok(positions.every(x=>x>=0));
 assert.ok(positions.every((x,i)=>i===0||positions[i-1]<x));
 assert.doesNotMatch(legacy,/Promise\.all/);
});
