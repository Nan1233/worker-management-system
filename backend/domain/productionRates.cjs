'use strict';

const { safeRatio, calculatePlannedOutput } = require('../../shared/productionMetricPrimitives.cjs');

// Pure production-rate calculation. Machine snapshots override worker-level
// training calculations and must remain authoritative for shared machines.
function calculateProductionRates({
  adjustedOutput,
  enteredOutput,
  actualTime,
  standard,
  factor,
  applyTrainingPercent,
  outputPerHourFormula,
  achievementFormula,
  hasMachinePerformance,
  machinePerformance,
  asNumber
}) {
  let plannedOutput = calculatePlannedOutput(standard, actualTime, applyTrainingPercent ? factor : 1);

  let outputPerHour = null;
  let achievement = null;

  if (hasMachinePerformance) {
    // Physical machine snapshots take precedence over worker-level formulas.
    adjustedOutput = asNumber(machinePerformance.counted_output);
    plannedOutput = asNumber(machinePerformance.maximum_output);
    outputPerHour = safeRatio(adjustedOutput, actualTime);
    achievement = safeRatio(adjustedOutput, plannedOutput);
  } else {
    const perHourNumerator = outputPerHourFormula === 'ENTERED_OUTPUT_DIV_ACTUAL_TIME'
      ? enteredOutput
      : adjustedOutput;

    outputPerHour = safeRatio(perHourNumerator, actualTime);

    achievement = achievementFormula === 'OUTPUT_PER_HOUR_DIV_STANDARD'
      ? safeRatio(outputPerHour, standard)
      : null;
  }

  return { adjustedOutput, plannedOutput, outputPerHour, achievement };
}

module.exports = { calculateProductionRates };
