'use strict';

// Kept as a compatibility adapter for older callers. KQD is an ordinary NG
// defect and is always included in production output.
const { calculateProductionOutput } = require('../../shared/productionOutput.cjs');

function recalculateReportOutput({ ttOk, defects }) {
  return calculateProductionOutput({ ok: ttOk, defects });
}

module.exports = { recalculateReportOutput };
