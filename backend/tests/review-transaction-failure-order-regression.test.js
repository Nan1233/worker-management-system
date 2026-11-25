'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const approve=fs.readFileSync(path.join(__dirname,'../services/productionApprovalWorkflowService.js'),'utf8');
const reject=fs.readFileSync(path.join(__dirname,'../services/productionRejectionWorkflowService.js'),'utf8');

function ordered(body, markers) {
  const indices = markers.map((marker) => body.indexOf(marker));
  assert.ok(indices.every((index) => index >= 0), 'missing marker: ' + markers.filter((_, i) => indices[i] < 0).join(', '));
  assert.ok(indices.every((index, i) => i === 0 || indices[i - 1] < index),
    'transaction order changed: ' + JSON.stringify(indices));
}

test('approval snapshots and versions are written before the pending report transitions', () => {
  ordered(approve, [
    'await validateApprovalSnapshot(item, connection',
    'await insertApprovedParent(connection, item, reviewerId)',
    'copyApprovedReportDetails(connection, approvedReportId, item.id)',
    'copyMachineLinesToApproved(item.id, approvedReportId, connection',
    'await createLegacyApprovedSnapshot(item, approvedReportId, reviewerId, connection',
    'await createApprovedReportVersion(',
    'await transitionApprovedTemp(connection, item, reviewerId)',
    'await recordApprovedTempVersion(item, approvedReportId, reviewerId, connection',
    'await AuditService.logActivities(postCommitActivities, connection)',
    'await commit(connection)',
    'await deliverApprovedPostCommitNotifications(postCommitNotifications)',
  ]);
});

test('rejection snapshot and audit are persisted before commit and notification', () => {
  ordered(reject, [
    'await transitionRejectedTemp(connection, row, expected, cleanReason, reviewerId)',
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
    assert.match(body, /catch \(error\) \{\s*if \((?:ownsTransaction && )?!transactionCommitted\) await rollbackReviewTransaction\(connection, error\);\s*throw error;/);
    assert.match(body, /finally \{\s*(?:if \(ownsTransaction\) )?connection\.release\(\)/);
  }
});
