'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeReviewTargets } = require('../controllers/productionTempControllerUtils');

test('review targets with matching duplicate IDs and version deduplicate safely', () => {
  assert.deepEqual(normalizeReviewTargets({ targets: [
    { id: 41, expected_updated_at: '2026-11-08T10:00:00.000Z' },
    { id: '41', expected_updated_at: '2026-11-08T10:00:00.000Z' },
    { id: 42, expected_updated_at: null }
  ] }), [
    { id: 41, expected_updated_at: '2026-11-08T10:00:00.000Z' },
    { id: 42, expected_updated_at: null }
  ]);
});

test('review targets with conflicting versions fail closed rather than picking first', () => {
  assert.throws(() => normalizeReviewTargets({ targets: [
    { id: 41, expected_updated_at: '2026-11-08T10:00:00.000Z' },
    { id: 41, expected_updated_at: '2026-11-08T10:05:00.000Z' }
  ] }), (error) => error.status === 409 && error.code === 'REVIEW_TARGET_VERSION_CONFLICT' && error.isPublic === true);
});

test('review targets with missing versus present version fail closed', () => {
  assert.throws(() => normalizeReviewTargets({ targets: [
    { id: 41 },
    { id: 41, expected_updated_at: '2026-11-08T10:05:00.000Z' }
  ] }), (error) => error.status === 409 && error.code === 'REVIEW_TARGET_VERSION_CONFLICT');
});

test('legacy review payloads retain supported ids and single-id behavior', () => {
  assert.deepEqual(normalizeReviewTargets({ ids: [41, 41, 42] }), [
    { id: 41, expected_updated_at: null },
    { id: 42, expected_updated_at: null }
  ]);
  assert.deepEqual(normalizeReviewTargets({ id: 41 }), [{ id: 41, expected_updated_at: null }]);
});
