'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('function assertRejectedTempTransition(');
const end=source.indexOf('module.exports = {',start);
assert.ok(start>=0&&end>start);
const events=[];
const ctx={AuditService:{notifyUsers:async(ids,payload)=>{events.push({ids,payload});}},console:{warn:(message)=>events.push({warning:message})}};
const helpers=source.slice(source.indexOf('function createReviewTransitionConflictError('), source.indexOf('function assertApprovedTempTransition('));
vm.runInNewContext(helpers+source.slice(start,end),ctx);
const transition=vm.runInNewContext('assertRejectedTempTransition',ctx);
const result=vm.runInNewContext('buildRejectionBatchResult',ctx);
const deliver=vm.runInNewContext('deliverRejectedPostCommitNotifications',ctx);

test('rejection final update requires exactly one affected row with stable public 409',()=>{
  for(const affectedRows of [1,'1']) assert.doesNotThrow(()=>transition({affectedRows},{id:7}));
  for(const update of [null,undefined,{}, {affectedRows:0},{affectedRows:2}]) {
    assert.throws(()=>transition(update,{id:7}),error=>{
      assert.equal(error.status,409);
      assert.equal(error.code,'TEMP_REPORT_VERSION_CONFLICT');
      assert.equal(error.isPublic,true);
      assert.equal(error.message,'Báo cáo #7 đã được xử lý bởi người khác. Hãy tải lại danh sách rồi thử lại.');
      return true;
    });
  }
});
test('rejection response preserves row order and count',()=>{
  const output=result([{id:8},{id:3}]);
  assert.deepEqual({count:output.count,ids:Array.from(output.ids)},{count:2,ids:[8,3]});
  const empty=result([]);
  assert.equal(empty.count,0);
  assert.deepEqual(Array.from(empty.ids),[]);
});
test('post-commit rejection delivery preserves recipient and payload references and order',async()=>{
  const a={userIds:[1],payload:{type:'a'}},b={userIds:[2],payload:{type:'b'}};
  await deliver([a,b]);
  assert.equal(events.length,2);
  assert.strictEqual(events[0].ids,a.userIds);
  assert.strictEqual(events[0].payload,a.payload);
  assert.strictEqual(events[1].ids,b.userIds);
});
test('notification failure is logged but later rejection notifications still deliver',async()=>{
  events.length=0;
  ctx.AuditService.notifyUsers=async(ids,payload)=>{
    if(ids[0]===1)throw new Error('network');
    events.push({ids,payload});
  };
  await deliver([{userIds:[1],payload:{}},{userIds:[2],payload:{ok:true}}]);
  assert.equal(events.length,2);
  assert.match(events[0].warning,/Post-commit rejection notification failed: network/);
  assert.equal(events[1].ids[0],2);
});
test('rejection maintains guarded update, snapshot, audit, commit, notification and result ordering',()=>{
  const flow=source.slice(source.indexOf('async rejectSelected('));
  const markers=[
    'const updateResult = await query(connection,updateSql,updateParams)',
    'assertRejectedTempTransition(updateResult, row)',
    'AuditService.loadTempReportSnapshot(row.id, connection)',
    'AuditService.createReportVersion(buildRejectedReportVersion(',
    'AuditService.logActivity(buildRejectedReportActivity(',
    'await commit(connection)',
    'await deliverRejectedPostCommitNotifications(postCommitNotifications)',
    'return buildRejectionBatchResult(rows)',
  ].map(x=>flow.indexOf(x));
  assert.ok(markers.every(x=>x>=0));
  assert.ok(markers.every((x,i)=>i===0||markers[i-1]<x));
  assert.match(flow,/await rollbackReviewTransaction\(connection, error\)/);
});
