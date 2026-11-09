'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('async function deliverRejectedPostCommitNotifications(');
const end = source.indexOf('async function deliverApprovedPostCommitNotifications(', start);
assert.ok(start >= 0 && end > start, 'rejection delivery helper exists');

function harness(notifyUsers) {
  const calls = [], warnings = [];
  const ctx = {
    AuditService: { notifyUsers: async (userIds, payload) => {
      calls.push({ userIds, payload });
      await notifyUsers(userIds, payload, calls.length);
    } },
    console: { warn: (message) => warnings.push(message) },
  };
  vm.runInNewContext(source.slice(start, end), ctx);
  return { deliver: vm.runInNewContext('deliverRejectedPostCommitNotifications', ctx), calls, warnings };
}

test('rejection notifications preserve order and original recipient/payload references', async () => {
  const h = harness(async () => {});
  const notifications = [
    { userIds: [3], payload: { type: 'rejected', reportId: 10 } },
    { userIds: [4], payload: { type: 'rejected', reportId: 11 } },
  ];
  await h.deliver(notifications);
  assert.equal(h.calls.length, 2);
  for (let i = 0; i < notifications.length; i++) {
    assert.strictEqual(h.calls[i].userIds, notifications[i].userIds);
    assert.strictEqual(h.calls[i].payload, notifications[i].payload);
  }
  assert.deepEqual(h.warnings, []);
});

test('one failed rejection notification does not prevent later delivery', async () => {
  const h = harness(async (_ids, _payload, index) => {
    if (index === 1) throw new Error('delivery unavailable');
  });
  await assert.doesNotReject(h.deliver([
    { userIds: [1], payload: { id: 1 } },
    { userIds: [2], payload: { id: 2 } },
    { userIds: [3], payload: { id: 3 } },
  ]));
  assert.equal(h.calls.length, 3);
  assert.deepEqual(h.warnings, ['[KTC] Post-commit rejection notification failed: delivery unavailable']);
});

test('empty rejection notification queue makes no network calls', async () => {
  const h = harness(async () => assert.fail('unexpected notification'));
  await h.deliver([]);
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.warnings, []);
});

test('rejection persists audit and commits before any notification delivery', () => {
  const flow = source.slice(source.indexOf('async rejectSelected('));
  const markers = [
    'assertRejectedTempTransition(updateResult, row)',
    'recordRejectedTempVersion(row, cleanReason, reviewerId, connection)',
    'AuditService.logActivity(',
    'await commit(connection)',
    'await deliverRejectedPostCommitNotifications(postCommitNotifications)',
    'return buildRejectionBatchResult(rows)',
  ];
  const positions = markers.map((marker) => flow.indexOf(marker));
  assert.ok(positions.every((position) => position >= 0), JSON.stringify(positions));
  assert.ok(positions.every((position, index) => index === 0 || positions[index - 1] < position));
  assert.doesNotMatch(flow, /Promise\.all/);
});
