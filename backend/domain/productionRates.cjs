'use strict';

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
  const canCalculatePlan = standard !== null
    && actualTime !== null
    && (!applyTrainingPercent || factor !== null);
  let plannedOutput = canCalculatePlan
    ? standard * actualTime * (applyTrainingPercent ? factor : 1)
    : null;

  let outputPerHour = null;
  let achievement = null;

  if (hasMachinePerformance) {
    // Physical machine snapshots take precedence over worker-level formulas.
    adjustedOutput = asNumber(machinePerformance.counted_output);
    plannedOutput = asNumber(machinePerformance.maximum_output);
    outputPerHour = actualTime && adjustedOutput !== null
      ? adjustedOutput / actualTime
      : null;
    achievement = plannedOutput ? adjustedOutput / plannedOutput : null;
  } else {
    const perHourNumerator = outputPerHourFormula === 'ENTERED_OUTPUT_DIV_ACTUAL_TIME'
      ? enteredOutput
      : adjustedOutput;

    outputPerHour = actualTime && perHourNumerator !== null
      ? perHourNumerator / actualTime
      : null;

    achievement = achievementFormula === 'OUTPUT_PER_HOUR_DIV_STANDARD'
      && outputPerHour !== null
      && standard
      ? outputPerHour / standard
      : null;
  }

  return { adjustedOutput, plannedOutput, outputPerHour, achievement };
}

module.exports = { calculateProductionRates };
