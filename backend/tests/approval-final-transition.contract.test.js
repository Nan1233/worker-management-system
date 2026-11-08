'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const approval = source.slice(source.indexOf('async approveSelected('), source.indexOf('async rejectSelected('));

test('approval final transition requires pending state and exactly one affected row', () => {
  assert.match(approval, /UPDATE production_reports_temp\s+SET status='approved'[\s\S]*?WHERE id=\? AND status IN \('pending','need_fix'\)/);
  assert.match(approval, /Number\(statusUpdate\?\.affectedRows \|\| 0\) !== 1/);
  assert.match(approval, /error\.status = 409;\s*error\.code = "APPROVAL_SELECTION_STALE";\s*error\.isPublic = true/);
});

test('approval checks final transition before temp snapshot, commit and postcommit notifications', () => {
  const guard = approval.indexOf('Number(statusUpdate?.affectedRows || 0) !== 1');
  const snapshot = approval.indexOf('const approvedTempSnapshot =');
  const commit = approval.indexOf('await commit(connection)');
  const notify = approval.indexOf('await AuditService.notifyBatch(');
  assert.ok(guard > 0 && guard < snapshot && snapshot < commit && commit < notify);
  assert.match(approval, /catch \(error\) \{\s*const rollbackResult = await rollback\(connection\)/);
});

test('approval still serializes selected reports with ordered locking read', () => {
  assert.match(approval, /ORDER BY temp\.id ASC\s+FOR UPDATE/);
  assert.match(approval, /rows\.length !== reportIds\.length/);
});
