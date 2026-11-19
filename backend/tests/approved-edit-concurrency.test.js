'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApprovedEditGuard } = require('../services/approvedEditConcurrency');

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('same-report edits run sequentially and keep the first operation in flight', async () => {
  const guard = createApprovedEditGuard();
  const firstRelease = deferred();
  const firstStarted = deferred();
  const calls = [];
  const wrapped = guard(async ({ tag }) => {
    calls.push('start:' + tag);
    if (tag === 'first') { firstStarted.resolve(); await firstRelease.promise; }
    calls.push('end:' + tag);
    return tag;
  }, 'reason');
  const first = wrapped({ reportId: 42, tag: 'first' });
  await firstStarted.promise;
  const second = wrapped({ reportId: 42, tag: 'second' });
  await Promise.resolve();
  assert.deepEqual(calls, ['start:first']);
  firstRelease.resolve();
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.deepEqual(calls, ['start:first', 'end:first', 'start:second', 'end:second']);
});

test('different reports can execute concurrently', async () => {
  const guard = createApprovedEditGuard();
  const hold = deferred();
  const started = deferred();
  const wrapped = guard(async ({ reportId }) => {
    if (reportId === 1) { started.resolve(); await hold.promise; }
    return reportId;
  }, 'reason');
  const first = wrapped({ reportId: 1 });
  await started.promise;
  assert.equal(await wrapped({ reportId: 2 }), 2);
  hold.resolve();
  assert.equal(await first, 1);
});

test('deadlock is retried with preserved argument and default reason', async () => {
  const guard = createApprovedEditGuard();
  let attempts = 0;
  const wrapped = guard(async (args) => {
    attempts++;
    assert.equal(args.reason, 'Cập nhật báo cáo đã duyệt');
    if (attempts === 1) throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK', errno: 1213 });
    return 'saved';
  }, 'Cập nhật báo cáo đã duyệt');
  assert.equal(await wrapped({ reportId: 7, reason: '  ' }), 'saved');
  assert.equal(attempts, 2);
});

test('non-retryable errors propagate and do not block the next report edit', async () => {
  const guard = createApprovedEditGuard();
  let attempts = 0;
  const wrapped = guard(async () => {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('validation'), { status: 422 });
    return 'ok';
  }, 'reason');
  await assert.rejects(wrapped({ reportId: 3 }), /validation/);
  assert.equal(await wrapped({ reportId: 3 }), 'ok');
  assert.equal(attempts, 2);
});

test('two simultaneous editors of one approved report: first commits, stale second gets 409 without a write', async () => {
  const guard = createApprovedEditGuard();
  const entered = deferred();
  const release = deferred();
  const writes = [];
  const persisted = { updatedAt: 'v1', note: 'original' };
  const edit = guard(async ({ editor, expectedUpdatedAt, note }) => {
    // Simulate the row-version check performed inside a locked DB transaction.
    const observed = persisted.updatedAt;
    if (observed !== expectedUpdatedAt) {
      throw Object.assign(new Error('stale approved report'), {
        status: 409, code: 'REPORT_VERSION_CONFLICT'
      });
    }
    if (editor === 'first') { entered.resolve(); await release.promise; }
    writes.push({ editor, note });
    persisted.note = note;
    persisted.updatedAt = 'v2';
    return { updatedAt: persisted.updatedAt };
  }, 'reason');
  const first = edit({ reportId: 501, editor: 'first', expectedUpdatedAt: 'v1', note: 'first edit' });
  await entered.promise;
  const second = edit({ reportId: 501, editor: 'second', expectedUpdatedAt: 'v1', note: 'stale edit' });
  release.resolve();
  assert.deepEqual(await first, { updatedAt: 'v2' });
  await assert.rejects(second, error => error.code === 'REPORT_VERSION_CONFLICT' && error.status === 409);
  assert.deepEqual(writes, [{ editor: 'first', note: 'first edit' }]);
  assert.equal(persisted.note, 'first edit');
});

test('repeated deadlock stops retrying after the guard retry limit', async () => {
  const guard = createApprovedEditGuard();
  let attempts = 0;
  const edit = guard(async () => {
    attempts++;
    throw Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK', errno: 1213 });
  }, 'reason');
  await assert.rejects(edit({ reportId: 502 }), error => error.code === 'ER_LOCK_DEADLOCK');
  assert.ok(attempts >= 2 && attempts <= 4, 'deadlock retries must be bounded');
});
