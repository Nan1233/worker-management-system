'use strict';

// Compatibility adapter for legacy approved-report flows. Historical KQD
// exclusion snapshots no longer participate in validation or calculations.
function normalizeKqdPolicySnapshot() {
  return 0;
}

function assertKqdPolicySnapshotConsistency() {
  return true;
}

function businessError(code, message, details = null) {
  const error = new Error(message);
  error.status = 422;
  error.code = code;
  error.isPublic = true;
  if (details) error.details = details;
  return error;
}

module.exports = {
  normalizeKqdPolicySnapshot,
  assertKqdPolicySnapshotConsistency,
  businessError
};
