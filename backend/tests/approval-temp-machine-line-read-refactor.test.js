'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('function buildTempMachineLinesRead(');
const end=source.indexOf('async function getTempMachineLines(',start);
assert.ok(start>=0&&end>start);
const ctx={};
vm.runInNewContext(source.slice(start,end),ctx);
const build=vm.runInNewContext('buildTempMachineLinesRead',ctx);
test('temp machine line query preserves table, filter and stable ordering',()=>{
 const result=build(42);
 assert.match(result.sql,/SELECT \*\s+FROM production_temp_machine_lines\s+WHERE temp_report_id=\?\s+ORDER BY sort_order ASC, id ASC/);
 assert.deepEqual(Array.from(result.params),[42]);
 assert.equal((result.sql.match(/\?/g)||[]).length,1);
});
test('temp report id conversion preserves Number coercion',()=>{
 for(const [value,expected] of [['0042',42],[null,0],['invalid',NaN],[-3,-3]]){
  const actual=Array.from(build(value).params)[0];
  if(Number.isNaN(expected))assert.ok(Number.isNaN(actual));
  else assert.equal(actual,expected);
 }
});
test('machine line loading keeps line read before defects and attaches matching defects',()=>{
 const flow=source.slice(source.indexOf('async function getTempMachineLines('),source.indexOf('// Build approved defect rows'));
 const markers=['buildTempMachineLinesRead(tempReportId)','await qRows(connection, lineSql, lineParams)','if (!lines.length) return []','buildTempMachineLineDefectsQuery(lines)','await qRows(connection, defectSql, defectParams)','attachMachineLineDefects(lines, defects)'];
 const positions=markers.map(x=>flow.indexOf(x));
 assert.ok(positions.every(x=>x>=0),JSON.stringify(positions));
 assert.ok(positions.every((x,i)=>i===0||positions[i-1]<x));
});
