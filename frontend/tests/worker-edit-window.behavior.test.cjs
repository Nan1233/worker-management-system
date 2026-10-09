'use strict';
// Behavioral test (not source/regex): imports the real TypeScript module via
// Node's built-in type stripping and exercises the worker edit-window rule.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const modulePath = pathToFileURL(path.join(__dirname, '../src/pages/worker/reportEditWindow.ts')).href;
const load = () => import(modulePath);

const MIN = 60 * 1000;
const at = (iso) => new Date(iso).getTime();

test('pending report: window is 10 minutes from creation', async () => {
  const { getWorkerEditWindow } = await load();
  const report = { status: 'pending', created_at: '2026-10-07T10:00:00.000Z', updated_at: '2026-10-07T10:05:00.000Z' };
  const open = getWorkerEditWindow(report, at('2026-10-07T10:09:59.000Z'));
  assert.equal(open.editable, true);
  assert.equal(open.fromRejection, false);
  assert.equal(open.remainingMs, 1000);
  const closed = getWorkerEditWindow(report, at('2026-10-07T10:10:00.000Z'));
  assert.equal(closed.editable, false);
  assert.equal(closed.reason, 'WINDOW_EXPIRED');
});

test('rejected report: window restarts from the rejection time, not from creation', async () => {
  const { getWorkerEditWindow } = await load();
  // created 3 hours before rejection: old rule (created_at + 10 min) would be long expired
  const report = { status: 'rejected', created_at: '2026-10-07T07:00:00.000Z', updated_at: '2026-10-07T10:00:00.000Z' };
  const justAfterRejection = getWorkerEditWindow(report, at('2026-10-07T10:01:00.000Z'));
  assert.equal(justAfterRejection.editable, true);
  assert.equal(justAfterRejection.fromRejection, true);
  assert.equal(justAfterRejection.remainingMs, 9 * MIN);
  const expired = getWorkerEditWindow(report, at('2026-10-07T10:10:01.000Z'));
  assert.equal(expired.editable, false);
  assert.equal(expired.reason, 'WINDOW_EXPIRED');
});

test('approved and unknown statuses are never editable by the worker', async () => {
  const { getWorkerEditWindow } = await load();
  const now = at('2026-10-07T10:01:00.000Z');
  for (const status of ['approved', 'deleted', 'something_else']) {
    const result = getWorkerEditWindow({ status, created_at: '2026-10-07T10:00:00.000Z', updated_at: '2026-10-07T10:00:00.000Z' }, now);
    assert.equal(result.editable, false, status);
    assert.equal(result.reason, 'STATUS_NOT_EDITABLE', status);
  }
});

test('missing or invalid timestamps never open the window', async () => {
  const { getWorkerEditWindow } = await load();
  assert.equal(getWorkerEditWindow({ status: 'pending' }, Date.now()).reason, 'TIME_UNKNOWN');
  assert.equal(getWorkerEditWindow({ status: 'rejected', created_at: '2026-10-07T10:00:00.000Z' }, Date.now()).reason, 'TIME_UNKNOWN');
  assert.equal(getWorkerEditWindow({ status: 'pending', created_at: 'not a date' }, Date.now()).editable, false);
});

test('DB timestamp strings without a zone are read as UTC (same as the backend parser)', async () => {
  const { parseDbDateMs } = await load();
  assert.equal(parseDbDateMs('2026-10-07 10:00:00'), at('2026-10-07T10:00:00.000Z'));
  assert.equal(parseDbDateMs('2026-10-07T10:00:00.000Z'), at('2026-10-07T10:00:00.000Z'));
  assert.ok(Number.isNaN(parseDbDateMs(null)));
});

test('formatRemaining renders m:ss', async () => {
  const { formatRemaining } = await load();
  assert.equal(formatRemaining(9 * MIN + 5000), '9:05');
  assert.equal(formatRemaining(0), '0:00');
});
