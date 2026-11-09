'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('function buildTempMachineLineDefectsQuery(');
const end=source.indexOf('module.exports = {',start);
assert.ok(start>=0&&end>start);
const ctx={};
vm.runInNewContext(source.slice(start,end),ctx);
const read=vm.runInNewContext('buildTempMachineLineDefectsQuery',ctx);
const insert=vm.runInNewContext('buildApprovedMachineDefectsInsert',ctx);
test('temp defect query preserves numeric ids and input ordering',()=>{
  const rows=[{id:'7'},{id:3},{id:'007'}];
  const result=read(rows);
  assert.deepEqual(Array.from(result.params),[7,3,7]);
  assert.match(result.sql,/FROM production_temp_machine_defects/);
  assert.ok(result.sql.includes('machine_line_id IN (?,?,?)'));
  assert.match(result.sql,/ORDER BY machine_line_id ASC, id ASC/);
  assert.equal(result.sql.split('?').length-1,result.params.length);
});
test('temp defect query rejects invalid IDs rather than silently filtering',()=>{
  for(const id of [0,'bad',null]){
    assert.throws(()=>read([{id:7},{id}]),error=>error.code==='TEMP_MACHINE_LINE_INVALID_ID');
  }
});
test('empty temp defect input preserves empty placeholder query',()=>{
  const result=read([]);
  assert.deepEqual(Array.from(result.params),[]);
  assert.ok(result.sql.includes('machine_line_id IN ()'));
});
test('bulk approved defect insert preserves five-column order and flattened values',()=>{
  const rows=[[1,2,'NG','Defect',0],[3,null,null,null,5]];
  const result=insert(rows);
  assert.match(result.sql,/INSERT INTO production_report_machine_defects/);
  assert.match(result.sql,/\(machine_line_id,defect_type_id,defect_code,defect_name,quantity\)/);
  assert.match(result.sql,/VALUES \(\?,\?,\?,\?,\?\),\(\?,\?,\?,\?,\?\)/);
  assert.deepEqual(Array.from(result.params),rows.flat());
  assert.equal((result.sql.match(/\?/g)||[]).length,result.params.length);
});
test('empty approved defect rows are handled by caller, not query builder',()=>{
  const result=insert([]);
  assert.deepEqual(Array.from(result.params),[]);
  assert.match(result.sql,/VALUES $/);
  assert.match(source,/if \(pendingDefects.length\) \{\s*const \{ sql: defectInsertSql/);
});
test('read and insert stay within original transaction data flow',()=>{
  const readFlow=source.slice(source.indexOf('async function getTempMachineLines('),source.indexOf('function buildApprovedMachineDefectRows('));
  assert.ok(readFlow.indexOf('if (!lines.length) return []')<readFlow.indexOf('buildTempMachineLineDefectsQuery(lines)'));
  assert.ok(readFlow.indexOf('buildTempMachineLineDefectsQuery(lines)')<readFlow.indexOf('attachMachineLineDefects(lines, defects)'));
  const copy=source.slice(source.indexOf('async function copyMachineLinesToApproved('),source.indexOf('function getExtraDataObject('));
  assert.ok(copy.indexOf('const pendingDefects = buildApprovedMachineDefectRows(')<copy.indexOf('if (pendingDefects.length)'));
  assert.ok(copy.indexOf('buildApprovedMachineDefectsInsert(pendingDefects)')<copy.lastIndexOf('return { ids:'));
});
