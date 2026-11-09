'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('function buildApprovedDetailCopyQuery(');
const end=source.indexOf('module.exports = {',start);
assert.ok(start>=0&&end>start);
const ctx={};
vm.runInNewContext(source.slice(start,end),ctx);
const copy=vm.runInNewContext('buildApprovedDetailCopyQuery',ctx);
const read=vm.runInNewContext('buildApprovedDetailReadQuery',ctx);
for(const [kind,table,temp,columns] of [
 ['defects','production_report_defects','production_temp_defects','defect_type_id,quantity'],
 ['deductions','production_report_deductions','production_temp_deductions','deduction_type_id,hours'],
]){
 test(kind+' copy retains INSERT SELECT projection, source and positional ids',()=>{
   const value=copy(kind,101,202);
   assert.match(value.sql,new RegExp('INSERT INTO '+table));
   assert.ok(value.sql.includes('('+['report_id',...columns.split(',')].join(',')+')'));
   assert.ok(value.sql.includes('SELECT ?,'+columns+' FROM '+temp+' WHERE temp_report_id=?'));
   assert.deepEqual(Array.from(value.params),[101,202]);
   assert.equal((value.sql.match(/\?/g)||[]).length,2);
 });
 test(kind+' read retains name join, ID and stable row ordering',()=>{
   const value=read(kind,101);
   assert.ok(value.sql.includes('FROM '+table+' d'));
   assert.match(value.sql,/LEFT JOIN (defect_types|deduction_types) dt ON dt\.id=d\.(defect_type_id|deduction_type_id)/);
   assert.match(value.sql,/WHERE d\.report_id=\? ORDER BY d\.id/);
   assert.deepEqual(Array.from(value.params),[101]);
 });
}
test('unsupported detail kind fails closed instead of issuing wrong SQL',()=>{
 assert.throws(()=>copy('other',1,2),/Unsupported approved detail kind/);
 assert.throws(()=>read('other',1),/Unsupported approved detail kind/);
});
test('approval keeps sequential detail copy and reads before machine lines and snapshots',()=>{
 const flow=source.slice(source.indexOf('async approveSelected('),source.indexOf('async rejectSelected('));
 const markers=['buildApprovedDetailCopyQuery("defects"','await query(connection, defectsCopySql, defectsCopyParams)','buildApprovedDetailCopyQuery("deductions"','await query(connection, deductionsCopySql, deductionsCopyParams)','buildApprovedDetailReadQuery("defects"','await qRows(connection, defectsReadSql, defectsReadParams)','buildApprovedDetailReadQuery("deductions"','await qRows(connection, deductionsReadSql, deductionsReadParams)','copyMachineLinesToApproved(item.id','createLegacyApprovedSnapshot(item','createApprovedReportVersion('];
 const positions=markers.map(x=>flow.indexOf(x));
 assert.ok(positions.every(x=>x>=0),JSON.stringify(positions));
 assert.ok(positions.every((x,i)=>i===0||positions[i-1]<x));
 assert.doesNotMatch(flow,/Promise\.all/);
});
