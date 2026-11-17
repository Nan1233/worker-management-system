'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalSelection.js'),'utf8');
const approvalSource=fs.readFileSync(path.join(__dirname,'../models/productionTempApprovalModel.js'),'utf8');
const start=source.indexOf('function createApprovalSelectionStaleError(');
const end=source.indexOf('module.exports = {',start);
assert.ok(start>=0&&end>start);
const ctx={Date,Set,Number};
vm.runInNewContext(source.slice(start,end),ctx);
const stale=vm.runInNewContext('createApprovalSelectionStaleError',ctx);
const conflict=vm.runInNewContext('createTempReportVersionConflictError',ctx);
const visible=vm.runInNewContext('assertApprovalSelectionVisible',ctx);
const versions=vm.runInNewContext('assertApprovalSelectionVersions',ctx);
test('missing selection error preserves public 409 contract and original id references',()=>{
 const requested=[1,2,3],missing=[2];
 const e=stale(requested,missing);
 assert.equal(e.status,409);
 assert.equal(e.code,'APPROVAL_SELECTION_STALE');
 assert.equal(e.isPublic,true);
 assert.equal(e.message,'Danh sách báo cáo đã thay đổi hoặc có báo cáo không còn trong phạm vi phê duyệt. Hãy tải lại danh sách rồi chọn lại.');
 assert.strictEqual(e.details.requested_ids,requested);
 assert.strictEqual(e.details.missing_ids,missing);
});
test('selection visibility keeps missing ids in requested order and does not reject equal counts',()=>{
 assert.doesNotThrow(()=>visible([{id:2},{id:1}],[1,2]));
 assert.throws(()=>visible([{id:3}],[1,2,3]),e=>e.code==='APPROVAL_SELECTION_STALE'&&JSON.stringify(Array.from(e.details.missing_ids))==='[1,2]');
});
test('version conflict preserves public 409 contract and localized report message',()=>{
 const e=conflict(25);
 assert.equal(e.status,409);
 assert.equal(e.code,'TEMP_REPORT_VERSION_CONFLICT');
 assert.equal(e.isPublic,true);
 assert.equal(e.message,'Báo cáo #25 đã thay đổi sau khi bạn mở danh sách. Hãy tải lại trước khi thử lại.');
});
test('version assertion preserves timestamp comparison and missing expected bypass',()=>{
 const row={id:5,updated_at:'2026-11-09T10:00:00.000Z'};
 assert.doesNotThrow(()=>versions([row],new Map([[5,'2026-11-09T10:00:00Z']])));
 assert.doesNotThrow(()=>versions([row],new Map()));
 assert.throws(()=>versions([row],new Map([[5,'2026-11-09T11:00:00Z']])),e=>e.code==='TEMP_REPORT_VERSION_CONFLICT'&&e.status===409);
});
test('both approval and rejection paths still share visibility and version assertions',()=>{
 for(const method of ['async approveSelected(','async rejectSelected(']){
  const start=approvalSource.indexOf(method),end=approvalSource.indexOf('async ',start+10);
  const flow=approvalSource.slice(start,end<0?undefined:end);
  assert.match(flow,/assertApprovalSelectionVisible\(rows, reportIds\)/);
  assert.match(flow,/assertApprovalSelectionVersions\(rows, expectedById\)/);
 }
});
