'use strict';

const { calculateProductionMetrics }=require('./productionCalculationEngine.cjs');

// Keep the original public helper names, but delegate all stored metrics to
// the canonical engine used by the original and generated process workbooks.
function plannedOutputFor(report,settings={}) {
  const metrics=calculateProductionMetrics(report,settings);
  return {planned:metrics.plannedOutput,trainingPercent:metrics.trainingPercent};
}
function groupedWorkHours(report,settings={}) {
  return calculateProductionMetrics(report,settings).workingTime;
}
function plannedAchievementRate(report,settings={}) {
  return calculateProductionMetrics(report,settings).achievement;
}
module.exports={plannedOutputFor,groupedWorkHours,plannedAchievementRate};
