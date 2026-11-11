'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildApprovalSelection,
  assertApprovalSelectionVisible,
  assertApprovalSelectionVersions,
} = require('../models/productionTempApprovalSelection');

test('extracted approval selection preserves unique IDs and guarded duplicate versions', () => {
  const stamp = '2026-11-10T08:00:00Z';
  const { reportIds, expectedById } = buildApprovalSelection([
    { id: 8, expected_updated_at: stamp },
    { id: '8', expected_updated_at: null },
    9,
  ]);
  assert.deepEqual(reportIds, [8, 9]);
  assert.equal(expectedById.get(8), stamp);
  assert.equal(expectedById.get(9), null);
  assert.doesNotThrow(() => assertApprovalSelectionVisible([{ id: 9 }, { id: 8 }], reportIds));
  assert.doesNotThrow(() => assertApprovalSelectionVersions([
    { id: 8, updated_at: '2026-11-10T08:00:00.000Z' },
    { id: 9, updated_at: 'invalid' },
  ], expectedById));
});

test('extracted approval selection fails closed on missing reports and version conflicts', () => {
  const stamp = '2026-11-10T08:00:00Z';
  const selection = buildApprovalSelection([{ id: 8, expected_updated_at: stamp }, 9]);
  assert.throws(
    () => assertApprovalSelectionVisible([{ id: 8 }], selection.reportIds),
    (error) => error.status === 409 && error.code === 'APPROVAL_SELECTION_STALE'
      && error.details.missing_ids.join(',') === '9'
  );
  assert.throws(
    () => assertApprovalSelectionVersions([{ id: 8, updated_at: '2026-11-10T09:00:00Z' }], selection.expectedById),
    (error) => error.status === 409 && error.code === 'TEMP_REPORT_VERSION_CONFLICT'
  );
  assert.throws(
    () => buildApprovalSelection([{ id: 8, expected_updated_at: stamp }, { id: 8, expected_updated_at: '2026-11-10T09:00:00Z' }]),
    (error) => error.status === 409 && error.code === 'TEMP_REPORT_VERSION_CONFLICT'
  );
});
