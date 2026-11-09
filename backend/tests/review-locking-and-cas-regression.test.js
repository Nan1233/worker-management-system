'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');

function extract(start, end, name) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, name + ' must exist');
  return vm.runInNewContext(source.slice(a, b) + '\n' + name + ';', {});
}
const approvalScope = extract('function buildApprovalScopeQuery(', 'function buildRejectionScopeQuery(', 'buildApprovalScopeQuery');
const rejectionScope = extract('function buildRejectionScopeQuery(', 'function buildTempMachineLineDefectsQuery(', 'buildRejectionScopeQuery');
const approvedTransition = extract('function buildApprovedTempTransitionQuery(', 'async function copyApprovedReportDetails(', 'buildApprovedTempTransitionQuery');
const rejectedTransition = extract('function buildRejectedReportUpdate(', 'function buildRejectedReportVersion(', 'buildRejectedReportUpdate');

test('approval and rejection lock selected pending rows and scope manager access', () => {
  for (const scope of [approvalScope, rejectionScope]) {
    const manager = scope([9, 3], 12, false);
    const admin = scope([9, 3], 12, true);
    for (const built of [manager, admin]) {
      assert.match(built.sql, /FOR UPDATE/);
      assert.match(built.sql, /status IN \('pending','need_fix'\)/);
      assert.match(built.sql, /ORDER BY temp\.id ASC/);
      assert.match(built.sql, /temp\.id IN \(\?,\?\)/);
    }
    assert.match(manager.sql, /manager_processes mp/);
    assert.match(manager.sql, /mp\.manager_id\s*=\s*\?/);
    assert.deepEqual(Array.from(manager.params), [9, 3, 12]);
    assert.doesNotMatch(admin.sql, /manager_processes mp/);
    assert.deepEqual(Array.from(admin.params), [9, 3]);
  }
});

test('approved transition uses selected updated_at and status compare-and-swap', () => {
  const built = approvedTransition({ id: 17, updated_at: '2026-10-30 08:00:00' }, 5);
  assert.match(built.sql, /WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?/);
  assert.deepEqual(Array.from(built.params), [5, 17, '2026-10-30 08:00:00']);
});

test('rejected transition uses timestamp guard only when supplied and always checks status', () => {
  const row = { id: 17 };
  const expected = '2026-10-30 08:00:00';
  const guarded = rejectedTransition(row, expected, 'Thiếu thông tin', 5);
  const unguarded = rejectedTransition(row, null, 'Thiếu thông tin', 5);
  assert.match(guarded.sql, /status IN \('pending','need_fix'\) AND updated_at=\?/);
  assert.deepEqual(Array.from(guarded.params), ['Thiếu thông tin', 5, 17, expected]);
  assert.match(unguarded.sql, /status IN \('pending','need_fix'\)/);
  assert.doesNotMatch(unguarded.sql, /AND updated_at=\?/);
  assert.deepEqual(Array.from(unguarded.params), ['Thiếu thông tin', 5, 17]);
});
