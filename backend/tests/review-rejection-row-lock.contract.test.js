'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const approve = source.slice(source.indexOf('async approveSelected('), source.indexOf('async rejectSelected('));
const reject = source.slice(source.indexOf('async rejectSelected('));

test('approval and rejection both lock selected pending reports in ascending ID order', () => {
  for (const [name, body] of [['approval', approve], ['rejection', reject]]) {
    assert.match(body, /AND temp\.status IN \('pending','need_fix'\)[\s\S]*?ORDER BY temp\.id ASC\s+FOR UPDATE`/, name);
    const visibilityGuard = 'assertApprovalSelectionVisible(rows, reportIds)';
    assert.ok(body.indexOf('FOR UPDATE') < body.indexOf(visibilityGuard), name);
    const versionGuard = 'assertApprovalSelectionVersions(rows, expectedById)';
    assert.ok(body.indexOf('FOR UPDATE') < body.indexOf(versionGuard), name);
  }
});

test('rejection keeps status-conditional updates and aborts entire batch on lost race', () => {
  const updateBuilder = source.slice(source.indexOf('function buildRejectedReportUpdate('), source.indexOf('function buildRejectedReportVersion('));
  assert.match(reject, /buildRejectedReportUpdate\(row, expected, cleanReason, reviewerId\)/);
  assert.match(updateBuilder, /WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?/);
  assert.match(updateBuilder, /WHERE id=\? AND status IN \('pending','need_fix'\)`/);
  assert.match(reject, /Number\(updateResult\?\.affectedRows \|\| 0\) !== 1/);
  assert.match(reject, /await rollback\(connection\)/);
  assert.match(reject, /await commit\(connection\)/);
});

test('stale rejection selections return public 409 so manager can reload', () => {
  const visible = source.slice(source.indexOf('function assertApprovalSelectionVisible('), source.indexOf('function assertApprovalSelectionVersions('));
  const versions = source.slice(source.indexOf('function assertApprovalSelectionVersions('), source.indexOf('module.exports = {'));
  assert.match(reject, /assertApprovalSelectionVisible\(rows, reportIds\)/);
  assert.match(reject, /assertApprovalSelectionVersions\(rows, expectedById\)/);
  assert.match(visible, /error\.code = "APPROVAL_SELECTION_STALE";\s*error\.isPublic = true/);
  assert.match(versions, /error\.code = "TEMP_REPORT_VERSION_CONFLICT";\s*error\.isPublic = true/);
  assert.match(reject, /error\.code = "TEMP_REPORT_VERSION_CONFLICT";\s*error\.isPublic = true/);
});
