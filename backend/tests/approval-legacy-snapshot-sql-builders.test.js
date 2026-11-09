'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('function buildLegacySnapshotDefectsRead(');
const end=source.indexOf('async function createLegacyApprovedSnapshot(',start);
assert.ok(start>=0&&end>start);
const ctx={qRows:async(_connection,sql,params)=>({sql,params})};
vm.runInNewContext(source.slice(start,end),ctx);
const defects=vm.runInNewContext('buildLegacySnapshotDefectsRead',ctx);
const deductions=vm.runInNewContext('buildLegacySnapshotDeductionsRead',ctx);
const upsert=vm.runInNewContext('buildLegacySnapshotInsert',ctx);
const reader=vm.runInNewContext('readLegacySnapshotRows',ctx);
test('defect snapshot read retains join, fields and id order',()=>{
 const result=defects(17);
 assert.match(result.sql,/SELECT dt\.defect_code, dt\.defect_name, d\.quantity/);
 assert.match(result.sql,/FROM production_report_defects d\s+LEFT JOIN defect_types dt ON dt\.id=d\.defect_type_id/);
 assert.match(result.sql,/WHERE d\.report_id=\? ORDER BY d\.id/);
 assert.deepEqual(Array.from(result.params),[17]);
});
test('deduction snapshot read retains join, fields and id order',()=>{
 const result=deductions(17);
 assert.match(result.sql,/SELECT dt\.deduction_code, dt\.deduction_name, d\.hours/);
 assert.match(result.sql,/FROM production_report_deductions d\s+LEFT JOIN deduction_types dt ON dt\.id=d\.deduction_type_id/);
 assert.match(result.sql,/WHERE d\.report_id=\? ORDER BY d\.id/);
 assert.deepEqual(Array.from(result.params),[17]);
});
test('snapshot upsert preserves v1 identity, conflict update and positional values',()=>{
 const result=upsert({standard_version_id:0},23,5,'{"ok":1}');
 assert.match(result.sql,/VALUES\(\?,'approved',\?,'v1',\?,\?\)/);
 assert.match(result.sql,/ON DUPLICATE KEY UPDATE/);
 for(const field of ['snapshot_data','standard_version_id','created_by'])assert.match(result.sql,new RegExp(field+'=VALUES\\('+field+'\\)'));
 assert.match(result.sql,/created_at=CURRENT_TIMESTAMP/);
 assert.deepEqual(Array.from(result.params),[23,null,'{"ok":1}',5]);
 assert.deepEqual(Array.from(upsert({standard_version_id:88},23,5,'x').params),[23,88,'x',5]);
});
test('snapshot reader forwards SQL and params without mutation',async()=>{
 const input=defects(8);
 const result=await reader({},input);
 assert.strictEqual(result.sql,input.sql);
 assert.strictEqual(result.params,input.params);
});
test('snapshot creation keeps sequential reads and single upsert',()=>{
 const flow=source.slice(source.indexOf('async function createLegacyApprovedSnapshot('),source.indexOf('// Preserve the positional values'));
 const markers=['buildLegacySnapshotDefectsRead(approvedReportId)','buildLegacySnapshotDeductionsRead(approvedReportId)','buildApprovedMachineLinesRead(approvedReportId)','JSON.stringify(buildLegacyApprovedSnapshotPayload(','buildLegacySnapshotInsert(item, approvedReportId, reviewerId, snapshotData)','await query(connection, snapshotSql, snapshotParams)'];
 const positions=markers.map(x=>flow.indexOf(x));
 assert.ok(positions.every(x=>x>=0));
 assert.ok(positions.every((x,i)=>i===0||positions[i-1]<x));
 assert.doesNotMatch(flow,/Promise\.all/);
});
