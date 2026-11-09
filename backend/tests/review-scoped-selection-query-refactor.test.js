'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('function buildApprovalScopeQuery(');
const end=source.indexOf('module.exports = {',start);
assert.ok(start>=0&&end>start);
const ctx={};
vm.runInNewContext(source.slice(start,end),ctx);
const approve=vm.runInNewContext('buildApprovalScopeQuery',ctx);
const reject=vm.runInNewContext('buildRejectionScopeQuery',ctx);
for(const [name,fn] of [['approval',approve],['rejection',reject]]){
  test(name+' scoped selection preserves admin parameter behavior and row locks',()=>{
    const ids=[9,2];
    const result=fn(ids,7,true);
    assert.deepEqual(Array.from(result.params),[9,2]);
    assert.match(result.sql,/temp\.id IN \(\?,\?\)/);
    assert.match(result.sql,/AND temp\.status IN \('pending','need_fix'\)/);
    assert.match(result.sql,/ORDER BY temp\.id ASC\s+FOR UPDATE$/);
    assert.doesNotMatch(result.sql,/manager_processes/);
    assert.doesNotMatch(result.sql,/mp\.manager_id/);
    assert.equal((result.sql.match(/\?/g)||[]).length,result.params.length);
  });
  test(name+' scoped selection preserves manager scope and parameter order',()=>{
    const result=fn([9,2],7,false);
    assert.deepEqual(Array.from(result.params),[9,2,7]);
    assert.match(result.sql,/manager_processes mp ON mp\.process_id\s*=\s*temp\.process_id/);
    assert.match(result.sql,/mp\.manager_id\s*=\s*\?/);
    assert.equal((result.sql.match(/\?/g)||[]).length,result.params.length);
  });
}
test('approval retains LEFT JOIN, full temp projection and process code lookup',()=>{
  const result=approve([3],4,false);
  assert.match(result.sql,/LEFT JOIN manager_processes/);
  assert.match(result.sql,/SELECT DISTINCT temp\.\*, w\.user_id AS worker_user_id/);
  assert.match(result.sql,/SELECT p\.process_code FROM processes p WHERE p\.id=temp\.process_id LIMIT 1/);
  assert.strictEqual(approve([3],4,true).params.length,1);
});
test('rejection retains inner JOIN and minimal row projection',()=>{
  const result=reject([3],4,false);
  assert.match(result.sql,/JOIN manager_processes mp ON mp\.process_id=temp\.process_id/);
  assert.doesNotMatch(result.sql,/LEFT JOIN manager_processes/);
  assert.match(result.sql,/SELECT DISTINCT temp\.id,temp\.worker_id,temp\.process_id,temp\.work_date,temp\.shift,temp\.updated_at/);
});
test('both flows query within transaction before visibility and version guards',()=>{
  for(const [name,stop] of [['approveSelected','async rejectSelected('],['rejectSelected','  },\n};']]){
    const a=source.indexOf('async '+name+'(');
    const flow=source.slice(a,source.indexOf(stop,a+10));
    const query=name==='approveSelected'?'buildApprovalScopeQuery':'buildRejectionScopeQuery';
    const markers=['await beginTransaction(connection)',query+'(reportIds, reviewerId, isAdmin)','await query(connection, selectionSql, selectionParams)','assertApprovalSelectionVisible(rows, reportIds)','assertApprovalSelectionVersions(rows, expectedById)'];
    const positions=markers.map(x=>flow.indexOf(x));
    assert.ok(positions.every(x=>x>=0),name+' missing selection marker');
    assert.ok(positions.every((x,i)=>i===0||positions[i-1]<x),name+' selection order');
  }
});
