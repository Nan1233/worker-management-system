'use strict';

const { safeRatio } = require('../../shared/productionMetricPrimitives.cjs');

// Keep the denominator selection independent of database and machine snapshots.
function calculateProductionNgRate({ formula, enteredOutput, ok, allNg }) {
  if (formula === 'NG_DIV_ENTERED_OUTPUT') {
    return safeRatio(allNg, enteredOutput);
  }
  const denominator = ok !== null && allNg !== null ? ok + allNg : null;
  return safeRatio(allNg, denominator);
}

module.exports = { calculateProductionNgRate };
