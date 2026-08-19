'use strict';

function businessError(code, message, details = null) {
  const error = new Error(message);
  error.status = 422;
  error.code = code;
  error.isPublic = true;
  if (details) error.details = details;
  return error;
}

function normalizeKqdPolicySnapshot(value, { allowNull = false } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') {
    if (allowNull) return null;
    throw businessError('KQD_POLICY_SNAPSHOT_MISSING', 'Báo cáo chưa có snapshot chính sách KQD');
  }
  const number = Number(value);
  if (number !== 0 && number !== 1) {
    throw businessError('KQD_POLICY_SNAPSHOT_INVALID', 'Snapshot chính sách KQD không hợp lệ');
  }
  return number;
}

function assertKqdPolicySnapshotConsistency({ resolved, snapshot }) {
  const actual = normalizeKqdPolicySnapshot(snapshot);
  const expected = Number(resolved?.excludeKqdFromTt || 0) === 1 ? 1 : 0;
  if (actual !== expected) {
    throw businessError('KQD_POLICY_SNAPSHOT_MISMATCH', 'Snapshot chính sách KQD không khớp nguồn định mức lịch sử', {
      expected_exclude_kqd_from_tt_snapshot: expected,
      stored_exclude_kqd_from_tt_snapshot: actual
    });
  }
  return true;
}

module.exports = {
  normalizeKqdPolicySnapshot,
  assertKqdPolicySnapshotConsistency,
  businessError
};
