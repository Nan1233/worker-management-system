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

test('pending report is editable after 10 minutes while the feature flag is off', async () => {
  const { getWorkerEditWindow, WORKER_EDIT_TIME_LIMIT_ENABLED } = await load();
  assert.equal(WORKER_EDIT_TIME_LIMIT_ENABLED, false);
  const report = { status: 'pending', created_at: '2026-10-07T10:00:00.000Z' };
  const result = getWorkerEditWindow(report, at('2026-10-08T10:00:00.000Z'));
  assert.equal(result.editable, true);
  assert.equal(result.remainingMs, Number.POSITIVE_INFINITY);
});

test('rejected report is editable after rejection without timestamp expiry', async () => {
  const { getWorkerEditWindow } = await load();
  const report = { status: 'rejected', created_at: '2026-10-07T07:00:00.000Z', updated_at: '2026-10-07T10:00:00.000Z' };
  const result = getWorkerEditWindow(report, at('2026-11-07T10:00:00.000Z'));
  assert.equal(result.editable, true);
  assert.equal(result.fromRejection, true);
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

test('disabled time limit does not require a timestamp for editable statuses', async () => {
  const { getWorkerEditWindow } = await load();
  assert.equal(getWorkerEditWindow({ status: 'pending' }).editable, true);
  assert.equal(getWorkerEditWindow({ status: 'need_fix', created_at: 'not a date' }).editable, true);
  assert.equal(getWorkerEditWindow({ status: 'rejected' }).editable, true);
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
