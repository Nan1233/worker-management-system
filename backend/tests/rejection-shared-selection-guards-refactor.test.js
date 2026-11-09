'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const approval = source.slice(source.indexOf('async approveSelected('), source.indexOf('async rejectSelected('));
const rejection = source.slice(source.indexOf('async rejectSelected('));

test('approval and rejection use identical selection, stale visibility and version guards', () => {
  for (const flow of [approval, rejection]) {
    assert.match(flow, /const \{ reportIds, expectedById \} = buildApprovalSelection\(targets\)/);
    assert.match(flow, /assertApprovalSelectionVisible\(rows, reportIds\)/);
    assert.match(flow, /assertApprovalSelectionVersions\(rows, expectedById\)/);
    const lock = flow.indexOf('await query(connection, selectionSql, selectionParams)');
    const visible = flow.indexOf('assertApprovalSelectionVisible(rows, reportIds)');
    const versions = flow.indexOf('assertApprovalSelectionVersions(rows, expectedById)');
    assert.ok(lock >= 0 && lock < visible && visible < versions);
  }
});

test('rejection validates batch size and reason before acquiring connection', () => {
  const batch = rejection.indexOf('assertReviewBatchSize(targets)');
  const selection = rejection.indexOf('buildApprovalSelection(targets)');
  const reason = rejection.indexOf('if (!cleanReason) throw new Error("Vui lòng nhập lý do từ chối")');
  const connection = rejection.indexOf('const connection = await getConnection()');
  assert.ok(batch >= 0 && batch < selection && selection < reason && reason < connection);
  assert.match(rejection, /const cleanReason = String\(reason \|\| ""\)\.trim\(\)/);
});

test('rejection keeps distinct scope and SQL conditions for manager vs admin', () => {
  const scoped = source.slice(source.indexOf('function buildRejectionScopeQuery('), source.indexOf('module.exports = {'));
  assert.match(rejection, /buildRejectionScopeQuery\(reportIds, reviewerId, isAdmin\)/);
  assert.match(scoped, /isAdmin \? "" : "JOIN manager_processes mp ON mp\.process_id=temp\.process_id"/);
  assert.match(scoped, /isAdmin \? "" : "AND mp\.manager_id=\?"/);
  assert.match(scoped, /isAdmin \? \[\.\.\.reportIds\] : \[\.\.\.reportIds,reviewerId\]/);
  assert.match(scoped, /ORDER BY temp\.id ASC\s+FOR UPDATE/);
  assert.match(rejection, /await rollback\(connection\)/);
  assert.match(rejection, /connection\.release\(\)/);
});
