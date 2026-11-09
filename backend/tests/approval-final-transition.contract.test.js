'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const approval = source.slice(source.indexOf('async approveSelected('), source.indexOf('async rejectSelected('));
const transition = source.slice(source.indexOf('function assertApprovedTempTransition('), source.indexOf('function buildApprovedTempSnapshotOptions('));
const transitionHelpers = source.slice(source.indexOf('function createReviewTransitionConflictError('), source.indexOf('function assertApprovedTempTransition('));
const transitionQuery = source.slice(source.indexOf('function buildApprovedTempTransitionQuery('), source.indexOf('module.exports = {'));

test('approval final transition requires pending state and exactly one affected row', () => {
  assert.match(transitionQuery, /UPDATE production_reports_temp\s+SET status='approved'[\s\S]*?WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?/);
  assert.match(approval, /assertApprovedTempTransition\(statusUpdate, item\)/);
  assert.match(transition, /!hasExactlyOneAffectedRow\(statusUpdate\)/);
  assert.match(transitionHelpers, /Number\(result\?\.affectedRows \|\| 0\) === 1/);
  assert.match(transition, /createReviewTransitionConflictError\(item\.id, "APPROVAL_SELECTION_STALE"\)/);
  assert.match(transitionHelpers, /error\.status = 409;[\s\S]*?error\.isPublic = true/);
});

test('approval checks final transition before temp snapshot, commit and postcommit notifications', () => {
  const guard = approval.indexOf('assertApprovedTempTransition(statusUpdate, item)');
  const snapshot = approval.indexOf('const approvedTempSnapshot =');
  const commit = approval.indexOf('await commit(connection)');
  const notify = approval.indexOf('await deliverApprovedPostCommitNotifications(');
  assert.ok(guard > 0 && guard < snapshot && snapshot < commit && commit < notify);
  assert.match(approval, /catch \(error\) \{\s*const rollbackResult = await rollback\(connection\)/);
});

test('approval selection is ordered, but its FOR UPDATE is stripped by the query adapter', () => {
  const shared = fs.readFileSync(path.join(__dirname, '../models/productionTempModelShared.js'), 'utf8');
  const scoped = source.slice(source.indexOf('function buildApprovalScopeQuery('), source.indexOf('function buildRejectionScopeQuery('));
  assert.match(approval, /buildApprovalScopeQuery\(reportIds, reviewerId, isAdmin\)/);
  assert.match(scoped, /ORDER BY temp\.id ASC\s+FOR UPDATE/);
  assert.match(shared, /const effectiveSql = isTempReportApprovalSelect\(sql\)\s*\? removeApprovalRowLock\(sql\)\s*:\s*sql/);
  assert.match(shared, /replace\(\/\\s\+FOR\\s\+UPDATE\\b\/gi, ""\)/);
  assert.match(approval, /assertApprovalSelectionVisible\(rows, reportIds\)/);
  const guard = source.slice(source.indexOf('function assertApprovalSelectionVisible('), source.indexOf('function assertApprovalSelectionVersions('));
  assert.match(guard, /rows\.length !== reportIds\.length/);
});

test('approval uses a guarded final status transition rather than relying on a pessimistic selection lock', () => {
  assert.match(transitionQuery, /WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?/);
  assert.match(approval, /assertApprovedTempTransition\(statusUpdate, item\)/);
  assert.match(transition, /!hasExactlyOneAffectedRow\(statusUpdate\)/);
  assert.match(transitionHelpers, /Number\(result\?\.affectedRows \|\| 0\) === 1/);
  assert.match(transition, /createReviewTransitionConflictError\(item\.id, "APPROVAL_SELECTION_STALE"\)/);
  assert.match(approval, /await rollback\(connection\)/);
});

test('approval compares final transition against the row version selected in this transaction', () => {
  assert.match(transitionQuery, /WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?/);
  assert.match(transitionQuery, /\[reviewerId, item\.id, item\.updated_at\]/);
  assert.match(approval, /buildApprovedTempTransitionQuery\(item, reviewerId\)/);
});
