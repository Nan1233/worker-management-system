'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildApprovalSelection: build, assertApprovalSelectionVersions: versions } = require('../models/productionTempApprovalSelection');

test('version checks are per-report, not shared across a mixed guarded and unguarded batch', () => {
  const selection = build([{ id: 1, expected_updated_at: '2026-10-30T01:00:00Z' }, { id: 2 }]);
  assert.doesNotThrow(() => versions([
    { id: 1, updated_at: '2026-10-30T01:00:00.000Z' },
    { id: 2, updated_at: '2026-10-30T03:00:00Z' },
  ], selection.expectedById));
  assert.throws(() => versions([
    { id: 1, updated_at: '2026-10-30T02:00:00Z' },
    { id: 2, updated_at: '2026-10-30T03:00:00Z' },
  ], selection.expectedById), (error) => error.code === 'TEMP_REPORT_VERSION_CONFLICT' && error.status === 409);
});

test('duplicate identical versions retain guard and conflicting versions fail closed', () => {
  const timestamp = '2026-10-30T01:00:00Z';
  const selection = build([{ id: 3, expected_updated_at: timestamp }, { id: '003' },
    { id: 3, expected_updated_at: '2026-10-30T01:00:00.000Z' }]);
  assert.equal(selection.expectedById.get(3), '2026-10-30T01:00:00.000Z');
  assert.throws(() => versions([{ id: 3, updated_at: '2026-10-30T01:00:01Z' }], selection.expectedById),
    (error) => error.code === 'TEMP_REPORT_VERSION_CONFLICT');
  assert.throws(() => build([{ id: 3, expected_updated_at: timestamp },
    { id: '003', expected_updated_at: '2026-10-30T01:00:01Z' }]),
    (error) => error.code === 'TEMP_REPORT_VERSION_CONFLICT');
});

test('version mismatch never mutates the supplied selection map', () => {
  const selection = build([{ id: 7, expected_updated_at: '2026-10-30T01:00:00Z' }]);
  const original = selection.expectedById.get(7);
  assert.throws(() => versions([{ id: 7, updated_at: '2026-10-30T02:00:00Z' }], selection.expectedById));
  assert.equal(selection.expectedById.get(7), original);
});
