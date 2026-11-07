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
