'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../services/productionRejectionWorkflowService.js'), 'utf8');
const {
  buildRejectedReportUpdate: update,
  buildRejectedReportVersion: version,
  buildRejectedReportActivity: activity,
  buildRejectedReportNotification: notification,
} = require('../models/productionTempRejectionBuilders');

test('rejection UPDATE preserves optimistic version condition and positional values', () => {
  const row = { id: 17, updated_at:'2026-10-30 11:00:00' };
  const withVersion = update(row, '2026-10-30 12:00:00', 'Thiếu số lượng', 9);
  assert.match(withVersion.sql, /WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?$/);
  assert.deepEqual(Array.from(withVersion.params), ['Thiếu số lượng', 9, 17, '2026-10-30 12:00:00']);
  const withoutVersion = update(row, null, 'Lỗi', 9);
  assert.match(withoutVersion.sql, /WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?$/);
  assert.deepEqual(Array.from(withoutVersion.params), ['Lỗi', 9, 17,row.updated_at]);
  assert.equal((withVersion.sql.match(/\?/g) || []).length, withVersion.params.length);
  assert.equal((withoutVersion.sql.match(/\?/g) || []).length, withoutVersion.params.length);
});

test('absent client version uses the locked row version and fails closed if unavailable', () => {
  for (const expected of ['', null, undefined, 0, false]) {
    const row = {id:'007',updated_at:'2026-10-30 11:00:00'};
    const result = update(row, expected, '', 0);
    assert.deepEqual(result.params,['',0,'007',row.updated_at]);
    assert.match(result.sql, /AND updated_at=\?/);
    assert.throws(()=>update({id:7},expected,'',0),{code:'TEMP_REPORT_VERSION_CONFLICT'});
  }
});

test('rejected report version retains exact temp report metadata and snapshot reference', () => {
  const snapshot = { original: true };
  const result = version({ id: 17 }, snapshot, 'Sai mã', 9);
  assert.deepEqual({ ...result }, {
    reportType: 'temp', reportId: 17, snapshot, reason: 'Bị từ chối: Sai mã', userId: 9,
  });
  assert.strictEqual(result.snapshot, snapshot);
});

test('rejection activity retains worker/process metadata, action and description', () => {
  const row = { id: 17, worker_id: 99, process_id: 1 };
  const result = activity(row, 'Cần sửa', 9);
  assert.deepEqual({ ...result, metadata: { ...result.metadata } }, {
    userId: 9, action: 'REPORT_REJECTED', entityType: 'temp_report', entityId: 17,
    description: 'Từ chối báo cáo #17: Cần sửa',
    metadata: { reason: 'Cần sửa', worker_id: 99, process_id: 1 },
  });
});

test('rejection notification preserves recipients, link, shift fallback and message', () => {
  const row = { id: 17, worker_user_id: 42, work_date: '2026-10-30', shift: '' };
  const result = notification(row, 'Cần sửa');
  assert.deepEqual(Array.from(result.userIds), [42]);
  assert.deepEqual({ ...result.payload }, {
    type: 'report_rejected', title: 'Báo cáo đã bị từ chối',
    message: 'Báo cáo ngày 2026-10-30, ca - bị từ chối: Cần sửa',
    linkUrl: '/worker/history/17?source=pending', entityType: 'temp_report', entityId: 17,
  });
  assert.equal(notification({ ...row, shift: 'C' }, 'Lỗi').payload.message,
    'Báo cáo ngày 2026-10-30, ca C bị từ chối: Lỗi');
});

test('rejection retains transactional ordering, guarded status update and post-commit delivery', () => {
  const reject = source.slice(source.indexOf('async function rejectSelected('));
  const positions = [
    'await beginTransaction(connection)',
    'await readReviewCandidates(connection, reportIds, reviewerId, isAdmin',
    'const updateResult = await transitionRejectedTemp(connection, row, expected, cleanReason, reviewerId)',
    'assertRejectedTempTransition(updateResult, row)',
    'recordRejectedTempVersion(row, cleanReason, reviewerId, connection)',
    'buildRejectedReportActivity(row, cleanReason, reviewerId)',
    'postCommitNotifications.push(buildRejectedReportNotification(row, cleanReason))',
    'await commit(connection)',
    'await deliverRejectedPostCommitNotifications(postCommitNotifications)',
  ].map((marker) => reject.indexOf(marker));
  assert.ok(positions.every((n) => n >= 0), 'all transaction markers remain');
  assert.ok(positions.every((n, i) => i === 0 || positions[i - 1] < n), 'transaction order unchanged');
  assert.match(reject, /await rollbackReviewTransaction\(connection, error\)/);
});

test('rejection builders do not mutate report rows and preserve date semantics', () => {
  const row = { id: 41, worker_id: 5, process_id: 8, worker_user_id: 17, work_date: '2026-11-20', shift: 'D' };
  const original = { ...row };
  const previousSnapshot = { tt_ok: 21 };
  const updateSql = update(row, '2026-11-20T05:00:00Z', 'Thiếu dữ liệu', 7);
  const result = version(row, previousSnapshot, 'Thiếu dữ liệu', 7);
  const activityValue = activity(row, 'Thiếu dữ liệu', 7);
  const workerNotice = notification(row, 'Thiếu dữ liệu');
  assert.strictEqual(result.snapshot, previousSnapshot);
  assert.deepEqual(row, original);
  assert.deepEqual(updateSql.params, ['Thiếu dữ liệu',7,41,'2026-11-20T05:00:00Z']);
  assert.equal(activityValue.metadata.worker_id, 5);
  assert.equal(activityValue.metadata.process_id, 8);
  assert.equal(workerNotice.payload.message, 'Báo cáo ngày 2026-11-20, ca D bị từ chối: Thiếu dữ liệu');
  assert.equal(workerNotice.payload.linkUrl, '/worker/history/41?source=pending');
});

test('rejection helpers are separate from transactional connection lifecycle', () => {
  const helperSource = fs.readFileSync(path.join(__dirname, '../models/productionTempRejectionBuilders.js'), 'utf8');
  assert.doesNotMatch(helperSource, /beginTransaction|commit\(connection\)|rollback\(connection\)|FOR UPDATE/);
  assert.match(source, /await beginTransaction\(connection\)/);
  assert.match(source, /await commit\(connection\)/);
  assert.match(source, /await rollbackReviewTransaction\(connection, error\)/);
  assert.match(source, /transitionRejectedTemp\(connection, row, expected, cleanReason, reviewerId\)/);
  const repo = fs.readFileSync(path.join(__dirname,'../repositories/productionRejectionRepository.js'),'utf8');
  assert.match(repo,/buildRejectedReportUpdate\(report, expectedUpdatedAt, reason, reviewerId\)/);
  assert.match(repo,/return query\(connection, sql, params\)/);
});
