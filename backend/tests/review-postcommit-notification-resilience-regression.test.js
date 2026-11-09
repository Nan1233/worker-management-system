'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('async function deliverRejectedPostCommitNotifications(');
const end = source.indexOf('function buildApprovalScopeQuery(', start);
assert.ok(start >= 0 && end > start, 'post-commit notification helpers must exist');

function setup(notifyUsers, notifyBatch) {
  const warnings = [];
  const ctx = {
    AuditService: { notifyUsers, notifyBatch },
    console: { warn: (message) => warnings.push(message) },
  };
  vm.runInNewContext(source.slice(start, end), ctx);
  return {
    rejected: vm.runInNewContext('deliverRejectedPostCommitNotifications', ctx),
    approved: vm.runInNewContext('deliverApprovedPostCommitNotifications', ctx),
    warnings,
  };
}

test('rejected notifications continue after a failed recipient and preserve ordering', async () => {
  const calls = [];
  const { rejected, warnings } = setup(async (users, payload) => {
    calls.push([users, payload]);
    if (calls.length === 2) throw new Error('recipient unavailable');
  }, async () => {});
  const notifications = [
    { userIds: [1], payload: { id: 11 } },
    { userIds: [2], payload: { id: 12 } },
    { userIds: [3], payload: { id: 13 } },
  ];
  await rejected(notifications);
  assert.deepEqual(calls, notifications.map((n) => [n.userIds, n.payload]));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Post-commit rejection notification failed: recipient unavailable/);
});

test('approved notification batch is delivered once with original payload', async () => {
  const calls = [];
  const notifications = [{ userIds: [4], payload: { type: 'report_approved' } }];
  const { approved, warnings } = setup(async () => {}, async (batch) => { calls.push(batch); });
  await approved(notifications);
  assert.equal(calls.length, 1);
  assert.strictEqual(calls[0], notifications);
  assert.equal(warnings.length, 0);
});

test('approved batch delivery failure is logged without rejecting completed approval', async () => {
  const { approved, warnings } = setup(async () => {}, async () => {
    throw new Error('notification transport down');
  });
  await assert.doesNotReject(approved([{ userIds: [4], payload: { id: 11 } }]));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Post-commit approval notification batch failed: notification transport down/);
});
