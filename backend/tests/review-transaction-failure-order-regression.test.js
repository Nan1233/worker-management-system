'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');

const approveStart = source.indexOf('async approveSelected(');
const rejectStart = source.indexOf('async rejectSelected(', approveStart);
assert.ok(approveStart >= 0 && rejectStart > approveStart);
const approve = source.slice(approveStart, rejectStart);
const reject = source.slice(rejectStart);

function ordered(body, markers) {
  const indices = markers.map((marker) => body.indexOf(marker));
  assert.ok(indices.every((index) => index >= 0), 'missing marker: ' + markers.filter((_, i) => indices[i] < 0).join(', '));
  assert.ok(indices.every((index, i) => i === 0 || indices[i - 1] < index),
    'transaction order changed: ' + JSON.stringify(indices));
}

test('approval snapshots and versions are written before the pending report transitions', () => {
  ordered(approve, [
    'await validateApprovalSnapshot(item, connection',
    'await query(connection, parentInsertSql, parentInsertParams)',
    'copyApprovedReportDetails(connection, approvedReportId, item.id)',
    'copyMachineLinesToApproved(item.id, approvedReportId, connection',
    'await createLegacyApprovedSnapshot(item, approvedReportId, reviewerId, connection',
    'await createApprovedReportVersion(',
    'await query(connection, statusSql, statusParams)',
    'await recordApprovedTempVersion(item, approvedReportId, reviewerId, connection',
    'await AuditService.logActivities(postCommitActivities, connection)',
    'await commit(connection)',
    'await deliverApprovedPostCommitNotifications(postCommitNotifications)',
  ]);
});

test('rejection snapshot and audit are persisted before commit and notification', () => {
  ordered(reject, [
    'await query(connection,updateSql,updateParams)',
    'assertRejectedTempTransition(updateResult, row)',
    'await recordRejectedTempVersion(row, cleanReason, reviewerId, connection)',
    'await AuditService.logActivity(buildRejectedReportActivity(row, cleanReason, reviewerId), connection)',
    'postCommitNotifications.push(buildRejectedReportNotification(row, cleanReason))',
    'await commit(connection)',
    'await deliverRejectedPostCommitNotifications(postCommitNotifications)',
  ]);
});

test('both review paths use one transaction and preserve rollback on exceptions', () => {
  for (const body of [approve, reject]) {
    assert.equal((body.match(/await beginTransaction\(connection\)/g) || []).length, 1);
    assert.equal((body.match(/await commit\(connection\)/g) || []).length, 1);
    assert.match(body, /catch \(error\) \{\s*await rollbackReviewTransaction\(connection, error\);\s*throw error;/);
    assert.match(body, /finally \{\s*connection\.release\(\)/);
  }
});
