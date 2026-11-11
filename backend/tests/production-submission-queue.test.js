'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { submissionQueueKey, runSerializedSubmission } = require('../services/productionSubmissionQueue');

test('request identity takes priority over logical duplicate and capacity identity', () => {
  const data = {
    worker_id: 49, process_id: 1, work_date: '2026-11-11',
    shift: 'a', client_request_id: ' request-1 ',
    logical_duplicate_key: 'logical-1'
  };
  assert.equal(submissionQueueKey(data, [{ machine_code: 'C01' }]), 'client:49:request-1');
  assert.equal(
    submissionQueueKey({ ...data, client_request_id: '' }),
    'logical:49:logical-1'
  );
});

test('capacity queue identity deduplicates and sorts machine codes', () => {
  const data = { worker_id: 49, process_id: 1, work_date: '2026-11-11', shift: 'a' };
  assert.equal(
    submissionQueueKey(data, [
      { machine_code: ' b ' }, { machine_code: 'A' }, { machine_code: 'a' }
    ]),
    'capacity:49:1:2026-11-11:A:A,B'
  );
});

test('same-key tasks run in submission order', async () => {
  const events = [];
  let releaseFirst;
  let firstStarted;
  const started = new Promise((resolve) => { firstStarted = resolve; });
  const first = runSerializedSubmission('test-sequential', async () => {
    events.push('first-start');
    firstStarted();
    await new Promise((resolve) => { releaseFirst = resolve; });
    events.push('first-end');
    return 1;
  });

  await started;
  const second = runSerializedSubmission('test-sequential', async () => {
    events.push('second');
    return 2;
  });
  assert.deepEqual(events, ['first-start']);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [1, 2]);
  assert.deepEqual(events, ['first-start', 'first-end', 'second']);
});

test('failed submission releases queue for a later task', async () => {
  const first = runSerializedSubmission('test-failure', async () => {
    throw new Error('submission failed');
  });
  const second = runSerializedSubmission('test-failure', async () => 'recovered');
  await assert.rejects(first, /submission failed/);
  assert.equal(await second, 'recovered');
});
