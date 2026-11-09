'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function getApprovedWorkDate(');
const end = source.indexOf('module.exports = {', start);
assert.ok(start >= 0 && end > start);
const ctx = { Date };
vm.runInNewContext(source.slice(start, end), ctx);
const getDate = vm.runInNewContext('getApprovedWorkDate', ctx);
const preload = vm.runInNewContext('buildApprovedVersionPreloaded', ctx);
const activities = vm.runInNewContext('buildApprovedPostCommitActivities', ctx);
const notification = vm.runInNewContext('buildApprovedPostCommitNotification', ctx);

test('approved work date retains local Date conversion and string truncation', () => {
  assert.equal(getDate({work_date: new Date(2026, 9, 3)}), '2026-10-03');
  assert.equal(getDate({work_date: '2026-10-30T11:20:00Z'}), '2026-10-30');
  assert.equal(getDate({work_date: null}), 'null');
});

test('approved version projections sort copies by type then id without mutating original rows', () => {
  const defects = [{id: 3, defect_type_id: 2, quantity: '3'}, {id: 2, defect_type_id: 1, quantity: 1}, {id: 1, defect_type_id: 2, quantity: 2}];
  const deductions = [{id: 2, deduction_type_id: 9, hours: '0.5'}, {id: 1, deduction_type_id: 2, hours: 1}];
  const lines = [{id: 9}];
  const result = preload(lines, defects, deductions);
  assert.strictEqual(result.machineLines, lines);
  assert.deepEqual(Array.from(result.defects, x => ({...x})), [
    {defect_type_id: 1, quantity: 1}, {defect_type_id: 2, quantity: 2}, {defect_type_id: 2, quantity: '3'},
  ]);
  assert.deepEqual(Array.from(result.deductions, x => ({...x})), [
    {deduction_type_id: 2, hours: 1}, {deduction_type_id: 9, hours: '0.5'},
  ]);
  assert.deepEqual(defects.map(x=>x.id), [3,2,1]);
  assert.deepEqual(deductions.map(x=>x.id), [2,1]);
});

test('approved audit activities preserve all three entries, metadata and order', () => {
  const item = {id: 11, worker_id: 3, process_id: 1, work_date: '2026-10-30', shift: 'B'};
  const result = Array.from(activities(item, 22, 7), x => ({...x, metadata: {...x.metadata}}));
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(x=>x.action), ['REPORT_APPROVED','REPORT_CREATED','REPORT_APPROVED']);
  assert.deepEqual(result.map(x=>x.entityType), ['temp_report','approved_report','approved_report']);
  assert.deepEqual(result.map(x=>x.entityId), [11,22,22]);
  assert.equal(result[0].description, 'Duyệt báo cáo thành công #22');
  assert.equal(result[1].description, 'Tạo báo cáo đã duyệt từ #11');
  assert.equal(result[2].description, 'Duyệt báo cáo #11 thành báo cáo đã duyệt #22');
  assert.deepEqual(result[2].metadata, {temp_report_id: 11, approved_report_id: 22, worker_id: 3, process_id: 1, work_date: '2026-10-30', shift: 'B'});
  assert.ok(result.every(x=>x.userId===7));
});

test('approved notification preserves recipient, date, fallback and approved history URL', () => {
  const item = {id: 11, worker_user_id: 8, shift: null, product_name: ''};
  const result = notification(item, 22, '2026-10-30');
  assert.deepEqual(Array.from(result.userIds), [8]);
  assert.deepEqual({...result.payload}, {
    type: 'report_approved', title: 'Báo cáo đã được duyệt',
    message: 'Báo cáo ngày 2026-10-30, ca -, sản phẩm - đã được duyệt.',
    linkUrl: '/worker/history/22?source=approved', entityType: 'approved_report', entityId: 22,
  });
  assert.equal(notification({...item, shift:'C', product_name:'P1'}, 23, '2026-11-01').payload.message,
    'Báo cáo ngày 2026-11-01, ca C, sản phẩm P1 đã được duyệt.');
});

test('approval still records audit before commit and sends notifications only after commit', () => {
  const flow = source.slice(source.indexOf('async approveSelected('), source.indexOf('async rejectSelected('));
  const markers = [
    'await validateApprovalSnapshot(item, connection, standardResolver, tempLinesCache)',
    'buildApprovedVersionPreloaded(approvedMachineLines, approvedDefects, approvedDeductions)',
    'postCommitActivities.push(...buildApprovedPostCommitActivities(item, approvedReportId, reviewerId))',
    'const statusUpdate = await query(',
    'postCommitNotifications.push(buildApprovedPostCommitNotification(item, approvedReportId, workDate))',
    'await AuditService.logActivities(postCommitActivities, connection)',
    'await commit(connection)',
    'await AuditService.notifyBatch(postCommitNotifications)',
  ].map(x=>flow.indexOf(x));
  assert.ok(markers.every(x=>x>=0), 'all approval transaction markers present');
  assert.ok(markers.every((x,i)=>i===0||markers[i-1]<x), 'approval transaction order preserved');
});
