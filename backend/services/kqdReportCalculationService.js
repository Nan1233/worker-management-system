'use strict';

const { calculateProductionOutput } = require('../../shared/kqdPolicy.cjs');
const { normalizeKqdPolicySnapshot } = require('./kqdPolicySnapshotService');

function recalculateReportOutput({ ttOk, defects, excludeKqdFromTtSnapshot }) {
  const snapshot = normalizeKqdPolicySnapshot(excludeKqdFromTtSnapshot);
  return calculateProductionOutput({
    ok: ttOk,
    defects,
    excludeKqdFromTt: snapshot === 1
  });
}

module.exports = { recalculateReportOutput };
