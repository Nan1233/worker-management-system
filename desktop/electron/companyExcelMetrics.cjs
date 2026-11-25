'use strict';

const { calculateProductionMetrics } = require('./productionCalculationEngine.cjs');

// Map canonical worker-credit metrics to company workbook fields.
function createCompanyExcelMetrics({ num, normalizeCode }) {
  function getMetrics(report) {
    const metrics = calculateProductionMetrics(report);
    const changeCount = (report.deductions || []).filter(item =>
      normalizeCode(item.deduction_type_code || item.deduction_code || item.code || item.deduction_name) === 'CHUYEN_MA' && num(item.hours) > 0
    ).length;
    return {
      ok: metrics.ok, totalNg: metrics.allNg, actualTime: metrics.actualTime,
      totalTime: metrics.workingTime, trainingPercent: metrics.trainingPercent,
      standardOutput: metrics.standard, plannedOutput: metrics.plannedOutput, actualOutput: metrics.adjustedOutput,
      outputPerHour: metrics.outputPerHour, achievement: metrics.achievement,
      ngRate: metrics.ngRate, deductionTotal: metrics.deductionTime, changeCount
    };
  }
  return { getMetrics };
}
module.exports = { createCompanyExcelMetrics };
