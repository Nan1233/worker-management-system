'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');

function flow(name, next) {
  const start = source.indexOf(name);
  assert.ok(start >= 0, name + ' exists');
  const end = next ? source.indexOf(next, start + name.length) : -1;
  return source.slice(start, end < 0 ? undefined : end);
}

test('approval validates entire selected batch before first write', () => {
  const body = flow('async approveSelected(', 'async rejectSelected(');
  const selection = body.indexOf('assertApprovalSelectionVisible(rows, reportIds)');
  const versions = body.indexOf('assertApprovalSelectionVersions(rows, expectedById)');
  const loop = body.indexOf('for (const item of rows)');
  const insert = body.indexOf('await query(connection, parentInsertSql, parentInsertParams)');
  assert.ok(selection >= 0 && versions > selection && loop > versions && insert > loop);
  assert.match(body, /await beginTransaction\(connection\)/);
  assert.match(body, /FOR UPDATE|buildApprovalScopeQuery\(/);
});

test('rejection validates entire selected batch before first update', () => {
  const body = flow('async rejectSelected(');
  const selection = body.indexOf('assertApprovalSelectionVisible(rows, reportIds)');
  const versions = body.indexOf('assertApprovalSelectionVersions(rows, expectedById)');
  const loop = body.indexOf('for (const row of rows)');
  const update = body.indexOf('await query(connection,updateSql,updateParams)');
  assert.ok(selection >= 0 && versions > selection && loop > versions && update > loop);
  assert.match(body, /await beginTransaction\(connection\)/);
});

test('approval processes each report sequentially and commits once after loop', () => {
  const body = flow('async approveSelected(', 'async rejectSelected(');
  const loop = body.indexOf('for (const item of rows)');
  const audit = body.indexOf('await AuditService.logActivities(postCommitActivities, connection)');
  const commit = body.indexOf('await commit(connection)');
  const notify = body.indexOf('await deliverApprovedPostCommitNotifications(postCommitNotifications)');
  assert.ok(loop >= 0 && audit > loop && commit > audit && notify > commit);
  assert.equal((body.match(/await commit\(connection\)/g) || []).length, 1);
  assert.doesNotMatch(body, /Promise\.all/);
});

test('rejection processes each report sequentially and commits once after loop', () => {
  const body = flow('async rejectSelected(');
  const loop = body.indexOf('for (const row of rows)');
  const commit = body.indexOf('await commit(connection)');
  const notify = body.indexOf('await deliverRejectedPostCommitNotifications(postCommitNotifications)');
  assert.ok(loop >= 0 && commit > loop && notify > commit);
  assert.equal((body.match(/await commit\(connection\)/g) || []).length, 1);
  assert.doesNotMatch(body, /Promise\.all/);
});

test('both batch paths roll back on failure and always release connection', () => {
  for (const name of ['async approveSelected(', 'async rejectSelected(']) {
    const body = flow(name, name.includes('approve') ? 'async rejectSelected(' : undefined);
    assert.match(body, /catch \(error\) \{\s*await rollbackReviewTransaction\(connection, error\);\s*throw error;/);
    assert.match(body, /finally \{\s*connection\.release\(\)/);
  }
});

test('approval batch cannot notify before all report transitions and audit logging', () => {
  const body = flow('async approveSelected(', 'async rejectSelected(');
  const transition = body.indexOf('assertApprovedTempTransition(statusUpdate, item)');
  const version = body.indexOf('recordApprovedTempVersion(item, approvedReportId, reviewerId, connection, tempLinesCache)');
  const activity = body.indexOf('await AuditService.logActivities(postCommitActivities, connection)');
  const commit = body.indexOf('await commit(connection)');
  const notify = body.indexOf('await deliverApprovedPostCommitNotifications(postCommitNotifications)');
  assert.ok(transition >= 0 && version > transition && activity > version && commit > activity && notify > commit);
});
