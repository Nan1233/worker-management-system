'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const selectionSource = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalSelection.js'), 'utf8');
const approve = source.slice(source.indexOf('async approveSelected('), source.indexOf('async rejectSelected('));
const reject = source.slice(source.indexOf('async rejectSelected('));

test('approval and rejection both lock selected pending reports in ascending ID order', () => {
  for (const [name, body] of [['approval', approve], ['rejection', reject]]) {
    const builder = source.slice(source.indexOf(name === 'approval' ? 'function buildApprovalScopeQuery(' : 'function buildRejectionScopeQuery('), source.indexOf(name === 'approval' ? 'function buildRejectionScopeQuery(' : 'module.exports = {'));
    assert.match(builder, /AND temp\.status IN \('pending','need_fix'\)[\s\S]*?ORDER BY temp\.id ASC\s+FOR UPDATE`/, name);
    const visibilityGuard = 'assertApprovalSelectionVisible(rows, reportIds)';
    assert.ok(body.indexOf('await query(connection, selectionSql, selectionParams)') < body.indexOf(visibilityGuard), name);
    const versionGuard = 'assertApprovalSelectionVersions(rows, expectedById)';
    assert.ok(body.indexOf('await query(connection, selectionSql, selectionParams)') < body.indexOf(versionGuard), name);
  }
});

test('rejection keeps status-conditional updates and aborts entire batch on lost race', () => {
  const updateBuilder = source.slice(source.indexOf('function buildRejectedReportUpdate('), source.indexOf('function buildRejectedReportVersion('));
  assert.match(reject, /buildRejectedReportUpdate\(row, expected, cleanReason, reviewerId\)/);
  assert.match(updateBuilder, /WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?/);
  assert.match(updateBuilder, /WHERE id=\? AND status IN \('pending','need_fix'\)`/);
  assert.match(reject, /assertRejectedTempTransition\(updateResult, row\)/);
  assert.match(source, /!hasExactlyOneAffectedRow\(updateResult\)/);
  assert.match(source, /Number\(result\?\.affectedRows \|\| 0\) === 1/);
  assert.match(reject, /await rollbackReviewTransaction\(connection, error\)/);
  assert.match(reject, /await commit\(connection\)/);
});

test('stale rejection selections return public 409 so manager can reload', () => {
  const visible = selectionSource.slice(selectionSource.indexOf('function assertApprovalSelectionVisible('), selectionSource.indexOf('function assertApprovalSelectionVersions('));
  const versions = selectionSource.slice(selectionSource.indexOf('function assertApprovalSelectionVersions('), selectionSource.indexOf('module.exports = {'));
  assert.match(reject, /assertApprovalSelectionVisible\(rows, reportIds\)/);
  assert.match(reject, /assertApprovalSelectionVersions\(rows, expectedById\)/);
  assert.match(visible, /createApprovalSelectionStaleError\(reportIds, missingIds\)/);
  const staleError = selectionSource.slice(selectionSource.indexOf("function createApprovalSelectionStaleError("), selectionSource.indexOf("function createTempReportVersionConflictError("));
  assert.match(staleError, /error\.code = "APPROVAL_SELECTION_STALE";\s*error\.isPublic = true/);
  assert.match(versions, /createTempReportVersionConflictError\(row\.id\)/);
  const versionError = selectionSource.slice(selectionSource.indexOf("function createTempReportVersionConflictError("), selectionSource.indexOf("function assertApprovalSelectionVisible("));
  assert.match(versionError, /error\.code = "TEMP_REPORT_VERSION_CONFLICT";\s*error\.isPublic = true/);
  assert.match(reject, /assertRejectedTempTransition\(updateResult, row\)/);
  assert.match(selectionSource, /error\.code = "TEMP_REPORT_VERSION_CONFLICT";\s*error\.isPublic = true/);
});
