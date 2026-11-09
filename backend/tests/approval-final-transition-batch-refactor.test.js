'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function assertApprovedTempTransition(');
const end = source.indexOf('module.exports = {', start);
assert.ok(start >= 0 && end > start);
const ctx = {};
vm.runInNewContext(source.slice(start, end), ctx);
const transition = vm.runInNewContext('assertApprovedTempTransition', ctx);
const options = vm.runInNewContext('buildApprovedTempSnapshotOptions', ctx);
const version = vm.runInNewContext('buildApprovedTempReportVersion', ctx);
const batch = vm.runInNewContext('buildApprovalBatchResult', ctx);

test('approved temp status transition must affect exactly one row', () => {
  assert.doesNotThrow(() => transition({affectedRows:1}, {id:7}));
  assert.doesNotThrow(() => transition({affectedRows:'1'}, {id:7}));
  for (const status of [null, undefined, {}, {affectedRows:0}, {affectedRows:2}]) {
    assert.throws(() => transition(status, {id:7}), error => {
      assert.equal(error.status, 409);
      assert.equal(error.code, 'APPROVAL_SELECTION_STALE');
      assert.equal(error.isPublic, true);
      assert.equal(error.message, 'Báo cáo #7 đã được xử lý bởi người khác. Hãy tải lại danh sách rồi thử lại.');
      return true;
    });
  }
});

test('machine snapshot options preserve cache hit even with empty array', () => {
  const lines = [];
  const cache = new Map([[7,lines]]);
  const hit = options({id:'7'},cache);
  assert.strictEqual(hit.machineLines, lines);
  assert.equal(options({id:8},cache),null);
  cache.set(8,null);
  assert.equal(options({id:8},cache).machineLines,null);
});

test('approved temp version payload preserves report identity and snapshot reference', () => {
  const snapshot = {machineLines:[{id:1}]};
  const result = version({id:7}, 19, 4, snapshot);
  assert.deepEqual({...result}, {
    reportType:'temp', reportId:7, snapshot,
    reason:'Được duyệt thành báo cáo chính thức #19', userId:4,
  });
  assert.strictEqual(result.snapshot,snapshot);
});

test('approval batch result retains input ordering and original approved IDs', () => {
  const rows = [{id:9},{id:2}];
  const ids = [41,42];
  const dates = new Set(['2026-10-30','2026-10-31']);
  const result = batch(rows,ids,dates);
  assert.equal(result.count,2);
  assert.deepEqual(Array.from(result.temp_ids),[9,2]);
  assert.strictEqual(result.approved_ids,ids);
  assert.deepEqual(Array.from(result.dates),['2026-10-30','2026-10-31']);
});

test('final transition, snapshot version, notification and commit keep original order', () => {
  const flow = source.slice(source.indexOf('async approveSelected('),source.indexOf('async rejectSelected('));
  const markers = [
    'const statusUpdate = await query(connection, statusSql, statusParams)',
    'assertApprovedTempTransition(statusUpdate, item)',
    'AuditService.loadTempReportSnapshot(',
    'buildApprovedTempSnapshotOptions(item, tempLinesCache)',
    'buildApprovedTempReportVersion(item, approvedReportId, reviewerId, approvedTempSnapshot)',
    'postCommitNotifications.push(buildApprovedPostCommitNotification(item, approvedReportId, workDate))',
    'await AuditService.logActivities(postCommitActivities, connection)',
    'await commit(connection)',
    'await deliverApprovedPostCommitNotifications(postCommitNotifications)',
    'return buildApprovalBatchResult(rows, approvedIds, dates)',
  ].map(x=>flow.indexOf(x));
  assert.ok(markers.every(x=>x>=0),'all transaction markers remain');
  assert.ok(markers.every((x,i)=>i===0||markers[i-1]<x),'transaction sequence unchanged');
});
