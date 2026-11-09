'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('function buildApprovedParentInsertQuery(');
const end=source.indexOf('module.exports = {',start);
assert.ok(start>=0&&end>start);
const calls=[];
const ctx={buildApprovedReportInsertValues:(item,reviewerId)=>{calls.push([item,reviewerId]);return ['existing-37-values'];}};
vm.runInNewContext(source.slice(start,end),ctx);
const parent=vm.runInNewContext('buildApprovedParentInsertQuery',ctx);
const transition=vm.runInNewContext('buildApprovedTempTransitionQuery',ctx);
test('approved parent insert retains all 38 fields including NOW approved_at',()=>{
 const item={id:14};const value=parent(item,7);
 assert.match(value.sql,/INSERT INTO production_reports/);
 assert.match(value.sql,/source_temp_id,worker_id,process_id,work_date,entry_date,shift/);
 assert.match(value.sql,/training_percent_snapshot,actual_output,tt_ok,tt_ng/);
 assert.match(value.sql,/extra_data,status,review_note,reviewed_by,approved_at/);
 assert.match(value.sql,/NOW\(\)\)/);
 assert.equal((value.sql.match(/\?/g)||[]).length,37);
 assert.deepEqual(Array.from(value.params),['existing-37-values']);
 assert.strictEqual(calls[0][0],item);
 assert.equal(calls[0][1],7);
});
test('optimistic temp transition keeps status guard, timestamp and parameter order',()=>{
 const item={id:55,updated_at:'2026-11-09T12:00:00.000Z'};
 const value=transition(item,9);
 assert.match(value.sql,/UPDATE production_reports_temp/);
 assert.match(value.sql,/SET status='approved',reviewed_by=\?,approved_at=NOW\(\),updated_at=NOW\(\)/);
 assert.match(value.sql,/WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?/);
 assert.deepEqual(Array.from(value.params),[9,55,item.updated_at]);
 assert.equal((value.sql.match(/\?/g)||[]).length,3);
});
test('null updated_at is passed through unchanged rather than coerced',()=>{
 const value=transition({id:1,updated_at:null},0);
 assert.deepEqual(Array.from(value.params),[0,1,null]);
});
test('parent insert precedes child copies, version snapshots and final temp transition',()=>{
 const flow=source.slice(source.indexOf('async approveSelected('),source.indexOf('async rejectSelected('));
 const markers=['buildApprovedParentInsertQuery(item, reviewerId)','await query(connection, parentInsertSql, parentInsertParams)','copyApprovedReportDetails(connection, approvedReportId, item.id)','copyMachineLinesToApproved(item.id','createLegacyApprovedSnapshot(item','createApprovedReportVersion(','buildApprovedTempTransitionQuery(item, reviewerId)','await query(connection, statusSql, statusParams)','assertApprovedTempTransition(statusUpdate, item)','await commit(connection)'];
 const positions=markers.map(x=>flow.indexOf(x));
 assert.ok(positions.every(x=>x>=0),JSON.stringify(positions));
 assert.ok(positions.every((x,i)=>i===0||positions[i-1]<x));
});
