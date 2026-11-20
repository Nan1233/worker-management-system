'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { idempotent } = require('../modules/production/domain/submissionIdempotency');

test('retry of one report returns its original ID and unchanged duplicate contract', () => {
  const row = { id: '42', status: 'pending', client_request_id: 'abc' };
  assert.deepEqual(idempotent(row), {
    id: 42,
    ids: [42],
    duplicate: true,
    duplicate_reason: 'request_id',
    existing_report: row,
  });
});

test('grouped retry returns ordered child ids from repository without remapping', () => {
  const row = { id: 50, machine_group_ids: [50, 51, 53] };
  const result = idempotent(row);
  assert.deepEqual(result.ids, [50, 51, 53]);
  assert.strictEqual(result.existing_report, row);
});

test('legacy GC grouped retries remain supported', () => {
  const row = { id: '8', gc_group_ids: [8, 9] };
  assert.deepEqual(idempotent(row).ids, [8, 9]);
});

test('machine group takes precedence over legacy GC group when both exist', () => {
  const row = { id: 7, machine_group_ids: [7, 8], gc_group_ids: [7, 9] };
  assert.deepEqual(idempotent(row).ids, [7, 8]);
});
