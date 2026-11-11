'use strict';

// Keep the denominator selection independent of database and machine snapshots.
function calculateProductionNgRate({ formula, enteredOutput, ok, allNg }) {
  if (formula === 'NG_DIV_ENTERED_OUTPUT') {
    return enteredOutput ? allNg / enteredOutput : null;
  }
  const denominator = ok !== null && allNg !== null ? ok + allNg : null;
  return denominator ? allNg / denominator : null;
}

module.exports = { calculateProductionNgRate };
