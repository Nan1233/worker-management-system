'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('async function deliverApprovedPostCommitNotifications(');
const end=source.indexOf('function buildApprovalScopeQuery(',start);
assert.ok(start>=0&&end>start);
const notifications=[{userIds:[9],payload:{type:'report_approved'}}];
test('successful postcommit notification sends exactly one batch unchanged',async()=>{
 const calls=[];const ctx={AuditService:{notifyBatch:async x=>calls.push(x)},console:{warn:()=>assert.fail('unexpected warning')}};
 vm.runInNewContext(source.slice(start,end),ctx);
 const deliver=vm.runInNewContext('deliverApprovedPostCommitNotifications',ctx);
 assert.equal(await deliver(notifications),undefined);
 assert.equal(calls.length,1);
 assert.strictEqual(calls[0],notifications);
});
test('notification failure is logged and does not reject after commit',async()=>{
 const warnings=[];const failure=new Error('network unavailable');
 const ctx={AuditService:{notifyBatch:async()=>{throw failure;}},console:{warn:x=>warnings.push(x)}};
 vm.runInNewContext(source.slice(start,end),ctx);
 const deliver=vm.runInNewContext('deliverApprovedPostCommitNotifications',ctx);
 await assert.doesNotReject(deliver(notifications));
 assert.deepEqual(warnings,['[KTC] Post-commit approval notification batch failed: network unavailable']);
});
test('empty notification batch is forwarded exactly once',async()=>{
 let count=0;const empty=[];
 const ctx={AuditService:{notifyBatch:async x=>{count++;assert.strictEqual(x,empty);}},console:{warn:()=>{}}};
 vm.runInNewContext(source.slice(start,end),ctx);
 await vm.runInNewContext('deliverApprovedPostCommitNotifications',ctx)(empty);
 assert.equal(count,1);
});
test('approval commits before notification and still returns batch result',()=>{
 const flow=source.slice(source.indexOf('async approveSelected('),source.indexOf('async rejectSelected('));
 const markers=['await AuditService.logActivities(postCommitActivities, connection)','await commit(connection)','await deliverApprovedPostCommitNotifications(postCommitNotifications)','return buildApprovalBatchResult(rows, approvedIds, dates)'];
 const positions=markers.map(x=>flow.indexOf(x));
 assert.ok(positions.every(x=>x>=0),JSON.stringify(positions));
 assert.ok(positions.every((x,i)=>i===0||positions[i-1]<x));
});
