'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildApprovedPostCommitActivities(');
const end = source.indexOf('async function rollbackReviewTransaction(', start);
const versionStart = source.indexOf('function buildApprovedTempReportVersion(');
const versionEnd = source.indexOf('function assertRejectedTempTransition(', versionStart);
assert.ok(start >= 0 && end > start && versionStart >= 0 && versionEnd > versionStart);
const ctx = {};
vm.runInNewContext(source.slice(start, end) + '\n' + source.slice(versionStart, versionEnd), ctx);
const activities = vm.runInNewContext('buildApprovedPostCommitActivities', ctx);
const notification = vm.runInNewContext('buildApprovedPostCommitNotification', ctx);
const tempVersion = vm.runInNewContext('buildApprovedTempReportVersion', ctx);
const batchResult = vm.runInNewContext('buildApprovalBatchResult', ctx);

const item = { id: 45, worker_id: 8, worker_user_id: 99, process_id: 2, work_date: '2026-11-09', shift: 'B', product_name: 'P-10' };

test('approval audit records both source and approved report lineage for reviewer', () => {
  const events = activities(item, 120, 7);
  assert.equal(events.length, 3);
  assert.deepEqual(Array.from(events, (event) => [event.userId, event.action, event.entityType, event.entityId]), [
    [7, 'REPORT_APPROVED', 'temp_report', 45],
    [7, 'REPORT_CREATED', 'approved_report', 120],
    [7, 'REPORT_APPROVED', 'approved_report', 120],
  ]);
  assert.equal(events[0].metadata.approved_report_id, 120);
  assert.equal(events[1].metadata.temp_report_id, 45);
  assert.equal(events[2].metadata.worker_id, 8);
  assert.equal(events[2].metadata.process_id, 2);
  assert.equal(events[2].metadata.work_date, '2026-11-09');
});

test('approved notification targets worker user and links to approved report', () => {
  const result = notification(item, 120, '09/11/2026');
  assert.deepEqual(Array.from(result.userIds), [99]);
  assert.equal(result.payload.type, 'report_approved');
  assert.equal(result.payload.entityType, 'approved_report');
  assert.equal(result.payload.entityId, 120);
  assert.equal(result.payload.linkUrl, '/worker/history/120?source=approved');
  assert.match(result.payload.message, /09\/11\/2026.*ca B.*P-10/);
});

test('temp version retains source snapshot and reviewer identity', () => {
  const snapshot = { machineLines: [{ id: 1 }] };
  const result = tempVersion(item, 120, 7, snapshot);
  assert.equal(result.reportType, 'temp');
  assert.equal(result.reportId, 45);
  assert.strictEqual(result.snapshot, snapshot);
  assert.equal(result.userId, 7);
  assert.match(result.reason, /#120/);
});

test('batch result keeps ordered source and approved IDs and copies dates', () => {
  const dates = new Set(['2026-11-09', '2026-11-08']);
  const result = batchResult([{ id: 45 }, { id: 46 }], [120, 121], dates);
  assert.equal(result.count, 2);
  assert.deepEqual(Array.from(result.temp_ids), [45, 46]);
  assert.deepEqual(Array.from(result.approved_ids), [120, 121]);
  assert.deepEqual(Array.from(result.dates), ['2026-11-09', '2026-11-08']);
  assert.notStrictEqual(result.dates, dates);
});
