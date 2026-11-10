'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('function createReviewTransitionConflictError(');
const end=source.indexOf('function buildApprovedTempSnapshotOptions(',start);
assert.ok(start>=0&&end>start);
const rejectStart=source.indexOf('function assertRejectedTempTransition(');
const rejectEnd=source.indexOf('function buildRejectionBatchResult(',rejectStart);
assert.ok(rejectStart>=0&&rejectEnd>rejectStart);
const ctx={Number,Error};
vm.runInNewContext(source.slice(start,end)+'\n'+source.slice(rejectStart,rejectEnd),ctx);
const approved=vm.runInNewContext('assertApprovedTempTransition',ctx);
const rejected=vm.runInNewContext('assertRejectedTempTransition',ctx);
const affected=vm.runInNewContext('hasExactlyOneAffectedRow',ctx);
const conflict=vm.runInNewContext('createReviewTransitionConflictError',ctx);
test('transition affected-row check retains Number coercion',()=>{
 for(const [result,ok] of [[{affectedRows:1},true],[{affectedRows:'1'},true],[{affectedRows:0},false],[{affectedRows:2},false],[{affectedRows:null},false],[null,false],[{},false]]){
  assert.equal(affected(result),ok);
 }
});
test('approved transition retains public stale-selection 409',()=>{
 assert.doesNotThrow(()=>approved({affectedRows:1},{id:19}));
 assert.throws(()=>approved({affectedRows:0},{id:19}),e=>e.status===409&&e.code==='APPROVAL_SELECTION_STALE'&&e.isPublic===true&&e.message==='Báo cáo #19 đã được xử lý bởi người khác. Hãy tải lại danh sách rồi thử lại.');
});
test('rejected transition retains public version-conflict 409',()=>{
 assert.doesNotThrow(()=>rejected({affectedRows:'1'},{id:20}));
 assert.throws(()=>rejected({affectedRows:2},{id:20}),e=>e.status===409&&e.code==='TEMP_REPORT_VERSION_CONFLICT'&&e.isPublic===true&&e.message==='Báo cáo #20 đã được xử lý bởi người khác. Hãy tải lại danh sách rồi thử lại.');
});
test('shared conflict constructor retains exact status and message for both codes',()=>{
 for(const code of ['APPROVAL_SELECTION_STALE','TEMP_REPORT_VERSION_CONFLICT']){
  const e=conflict(5,code);
  assert.equal(e.code,code);assert.equal(e.status,409);assert.equal(e.isPublic,true);
  assert.match(e.message,/Báo cáo #5 đã được xử lý bởi người khác/);
 }
});
test('both paths still validate transition after status update and before commit',()=>{
 for(const [method,guard] of [['async approveSelected(','assertApprovedTempTransition(statusUpdate, item)'],['async rejectSelected(','assertRejectedTempTransition(updateResult, row)']]){
  const start=source.indexOf(method),end=source.indexOf('async ',start+10);
  const flow=source.slice(start,end<0?undefined:end);
  const pos=[flow.indexOf(guard),flow.indexOf('await commit(connection)')];
  assert.ok(pos[0]>=0&&pos[1]>pos[0],method);
 }
});
