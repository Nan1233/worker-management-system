'use strict';
const { calculateStoredProductionMetrics, safeRatio } = require('../../shared/productionMetricPrimitives.cjs');

function projectApprovedReportKpi(report) {
  const metrics = calculateStoredProductionMetrics(report);
  const denominator = metrics.ok != null && metrics.allNg != null ? metrics.ok + metrics.allNg : null;
  return { ...metrics, okRate: safeRatio(metrics.ok, denominator) };
}
module.exports = { projectApprovedReportKpi };
