'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('async function copyApprovedReportDetails(');
const end=source.indexOf('module.exports = {',start);
assert.ok(start>=0&&end>start);
function harness({snapshots={},failQuery=false}={}){
 const events=[],connection={tag:'transaction'};
 const ctx={
  query:async(c,sql,params)=>{events.push({kind:'write',c,sql,params});if(failQuery)throw Error('write failed');},
  qRows:async(c,sql,params)=>{events.push({kind:'read',c,sql,params});return sql.includes('defect')?[{defect_type_id:3}]:[{deduction_type_id:4}];},
  buildApprovedDetailCopyQuery:(kind,approvedId,tempId)=>({sql:'copy_'+kind,params:[approvedId,tempId]}),
  buildApprovedDetailReadQuery:(kind,approvedId)=>({sql:'read_'+kind,params:[approvedId]}),
  AuditService:{
   loadTempReportSnapshot:async(id,c,options)=>{events.push({kind:'snapshot',id,c,options});return snapshots[id]||null;},
   createReportVersion:async(payload,c)=>{events.push({kind:'version',payload,c});},
  },
  buildApprovedTempSnapshotOptions:(item,cache)=>cache.has(Number(item.id))?{machineLines:cache.get(Number(item.id))}:null,
  buildApprovedTempReportVersion:(item,id,reviewer,snapshot)=>({type:'approved',id:item.id,approvedId:id,reviewer,snapshot}),
  buildRejectedReportVersion:(row,snapshot,reason,reviewer)=>({type:'rejected',id:row.id,reason,reviewer,snapshot}),
 };
 vm.runInNewContext(source.slice(start,end),ctx);
 return {ctx,events,connection,copy:vm.runInNewContext('copyApprovedReportDetails',ctx),approve:vm.runInNewContext('recordApprovedTempVersion',ctx),reject:vm.runInNewContext('recordRejectedTempVersion',ctx)};
}
test('approved details copy both types before sequential reads on same connection',async()=>{
 const h=harness(),result=await h.copy(h.connection,22,11);
 assert.deepEqual(h.events.map(x=>x.sql),['copy_defects','copy_deductions','read_defects','read_deductions']);
 assert.deepEqual(h.events.map(x=>Array.from(x.params)),[[22,11],[22,11],[22],[22]]);
 assert.ok(h.events.every(x=>x.c===h.connection));
 assert.equal(result.approvedDefects[0].defect_type_id,3);
 assert.equal(result.approvedDeductions[0].deduction_type_id,4);
});
test('failed detail write stops later copy and read immediately',async()=>{
 const h=harness({failQuery:true});
 await assert.rejects(h.copy(h.connection,22,11),/write failed/);
 assert.deepEqual(h.events.map(x=>x.sql),['copy_defects']);
});
test('approved temp snapshot is loaded with cached machine lines and persisted only if present',async()=>{
 const snapshot={a:1},h=harness({snapshots:{11:snapshot}}),lines=[{id:1}],cache=new Map([[11,lines]]);
 await h.approve({id:11},22,3,h.connection,cache);
 assert.deepEqual(h.events.map(x=>x.kind),['snapshot','version']);
 assert.strictEqual(h.events[0].options.machineLines,lines);
 assert.strictEqual(h.events[1].payload.snapshot,snapshot);
 assert.equal(h.events[1].payload.approvedId,22);
 assert.strictEqual(h.events[1].c,h.connection);
});
test('approved temp snapshot missing skips version insert and preserves null cache option',async()=>{
 const h=harness();
 await h.approve({id:11},22,3,h.connection,new Map());
 assert.deepEqual(h.events.map(x=>x.kind),['snapshot']);
 assert.equal(h.events[0].options,null);
});
test('rejected snapshot creates version with original reason and reviewer on same connection',async()=>{
 const snapshot={id:1},h=harness({snapshots:{7:snapshot}});
 await h.reject({id:7},'Lỗi dữ liệu',9,h.connection);
 assert.deepEqual(h.events.map(x=>x.kind),['snapshot','version']);
 assert.equal(h.events[1].payload.reason,'Lỗi dữ liệu');
 assert.equal(h.events[1].payload.reviewer,9);
 assert.strictEqual(h.events[1].payload.snapshot,snapshot);
 assert.strictEqual(h.events[1].c,h.connection);
});
test('rejected missing snapshot skips version insert',async()=>{
 const h=harness();
 await h.reject({id:7},'Lỗi',9,h.connection);
 assert.deepEqual(h.events.map(x=>x.kind),['snapshot']);
});
test('approval detail copy remains before machine lines, audit version before notification and commit',()=>{
 const flow=source.slice(source.indexOf('async approveSelected('),source.indexOf('async rejectSelected('));
 const markers=['copyApprovedReportDetails(connection, approvedReportId, item.id)','copyMachineLinesToApproved(item.id','createLegacyApprovedSnapshot(item','createApprovedReportVersion(','assertApprovedTempTransition(statusUpdate, item)','recordApprovedTempVersion(item, approvedReportId, reviewerId, connection, tempLinesCache)','postCommitNotifications.push(','await commit(connection)'];
 const positions=markers.map(x=>flow.indexOf(x));
 assert.ok(positions.every(x=>x>=0),JSON.stringify(positions));
 assert.ok(positions.every((x,i)=>i===0||positions[i-1]<x));
});
test('rejection audit version remains between status guard and activity',()=>{
 const flow=source.slice(source.indexOf('async rejectSelected('));
 const markers=['assertRejectedTempTransition(updateResult, row)','recordRejectedTempVersion(row, cleanReason, reviewerId, connection)','AuditService.logActivity(','await commit(connection)'];
 const positions=markers.map(x=>flow.indexOf(x));
 assert.ok(positions.every(x=>x>=0),JSON.stringify(positions));
 assert.ok(positions.every((x,i)=>i===0||positions[i-1]<x));
});
