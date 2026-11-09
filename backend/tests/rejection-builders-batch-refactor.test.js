'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildRejectedReportUpdate(');
const end = source.indexOf('module.exports = {', start);
assert.ok(start >= 0 && end > start);
const ctx = { toDateKey: (value) => String(value).slice(0, 10) };
vm.runInNewContext(source.slice(start, end), ctx);
const update = vm.runInNewContext('buildRejectedReportUpdate', ctx);
const version = vm.runInNewContext('buildRejectedReportVersion', ctx);
const activity = vm.runInNewContext('buildRejectedReportActivity', ctx);
const notification = vm.runInNewContext('buildRejectedReportNotification', ctx);

test('rejection UPDATE preserves optimistic version condition and positional values', () => {
  const row = { id: 17 };
  const withVersion = update(row, '2026-10-30 12:00:00', 'Thiếu số lượng', 9);
  assert.match(withVersion.sql, /WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?$/);
  assert.deepEqual(Array.from(withVersion.params), ['Thiếu số lượng', 9, 17, '2026-10-30 12:00:00']);
  const withoutVersion = update(row, null, 'Lỗi', 9);
  assert.match(withoutVersion.sql, /WHERE id=\? AND status IN \('pending','need_fix'\)$/);
  assert.deepEqual(Array.from(withoutVersion.params), ['Lỗi', 9, 17]);
  assert.equal((withVersion.sql.match(/\?/g) || []).length, withVersion.params.length);
  assert.equal((withoutVersion.sql.match(/\?/g) || []).length, withoutVersion.params.length);
});

test('falsy expected versions retain original unguarded branch', () => {
  for (const expected of ['', null, undefined, 0, false]) {
    const result = update({ id: '007' }, expected, '', 0);
    assert.equal(result.params.length, 3);
    assert.equal(result.params[2], '007');
    assert.doesNotMatch(result.sql, /AND updated_at=\?/);
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
  const reject = source.slice(source.indexOf('async rejectSelected('));
  const positions = [
    'await beginTransaction(connection)',
    'await query(connection, selectionSql, selectionParams)',
    'buildRejectedReportUpdate(row, expected, cleanReason, reviewerId)',
    'const updateResult = await query(connection,updateSql,updateParams)',
    'assertRejectedTempTransition(updateResult, row)',
    'AuditService.loadTempReportSnapshot(row.id, connection)',
    'buildRejectedReportVersion(row, rejectedSnapshot, cleanReason, reviewerId)',
    'buildRejectedReportActivity(row, cleanReason, reviewerId)',
    'postCommitNotifications.push(buildRejectedReportNotification(row, cleanReason))',
    'await commit(connection)',
    'await deliverRejectedPostCommitNotifications(postCommitNotifications)',
  ].map((marker) => reject.indexOf(marker));
  assert.ok(positions.every((n) => n >= 0), 'all transaction markers remain');
  assert.ok(positions.every((n, i) => i === 0 || positions[i - 1] < n), 'transaction order unchanged');
  assert.match(reject, /await rollbackReviewTransaction\(connection, error\)/);
});
