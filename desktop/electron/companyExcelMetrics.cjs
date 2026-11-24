'use strict';

const { parseStoredTrainingSnapshot, safeRatio, calculateNetHours } = require(typeof process.resourcesPath === 'string' && require('node:fs').existsSync(require('node:path').join(process.resourcesPath, 'shared', 'productionMetricPrimitives.cjs')) ? require('node:path').join(process.resourcesPath, 'shared', 'productionMetricPrimitives.cjs') : '../../shared/productionMetricPrimitives.cjs');

// Pure company workbook metrics. Approved report snapshots take precedence over mutable master data.
function createCompanyExcelMetrics({ num, normalizeCode, safeText }) {
function sumDetails(items, valueKey) {
  return (items || []).reduce((sum, item) => sum + num(item?.[valueKey]), 0);
}

function getMetrics(report) {
  const ok = num(report.tt_ok ?? report.ok_quantity ?? report.ok);
  const totalNg = report.tt_ng !== null && report.tt_ng !== undefined && String(report.tt_ng).trim() !== '' ? num(report.tt_ng) : sumDetails(report.defects, 'quantity');
  const isGiaCongMachine = normalizeCode(report.process_code) === 'GC' && String(report.operation_mode || '').toUpperCase() === 'MACHINE';
  const machineLines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';
  const lineParticipationHours = machineLines.reduce(
    (sum, line) => sum + Math.max(0, num(line?.machine_time_hours)),
    0
  );
  const workerTotalTime = hasValue(report.total_time)
    ? Math.max(0, num(report.total_time))
    : lineParticipationHours;
  const workerDeductionTime = hasValue(report.deduction_time)
    ? Math.max(0, num(report.deduction_time))
    : sumDetails(report.deductions, 'hours');
  const totalTime = isGiaCongMachine
    ? workerTotalTime
    : (hasValue(report.total_time) ? num(report.total_time) : num(report.actual_time ?? report.working_time ?? report.work_time) + sumDetails(report.deductions, 'hours'));
  const actualTime = isGiaCongMachine
    ? (hasValue(report.actual_time) ? Math.max(0, num(report.actual_time)) : (calculateNetHours(workerTotalTime, workerDeductionTime) ?? 0))
    : num(report.actual_time ?? report.working_time ?? report.work_time);
  // Approved historical snapshot takes precedence over mutable worker master data.
  const trainingPercent = parseStoredTrainingSnapshot(report.training_percent_snapshot);
  // Không làm tròn định mức theo giờ. Nhiều mã có định mức thập phân
  // (ví dụ 6.315789 SP/giờ); làm tròn sẽ khiến TT và tỷ lệ đạt sai.
  const standardOutput = num(report.standard_output ?? report.standard_output_per_hour ?? report.standard);
  const countedNg = totalNg;
  const hasActualOutput = report.actual_output !== null && report.actual_output !== undefined && safeText(report.actual_output).trim() !== '';
  const actualOutput = hasActualOutput ? num(report.actual_output) : ok + countedNg;
  const outputPerHour = safeRatio(actualOutput, actualTime) ?? 0;
  const achievement = safeRatio(outputPerHour, standardOutput) ?? 0;
  const ngRate = safeRatio(totalNg, ok + totalNg) ?? 0;
  const deductionTotal = isGiaCongMachine ? workerDeductionTime : sumDetails(report.deductions, 'hours');
  const changeCount = (report.deductions || []).filter((item) =>
    normalizeCode(item.deduction_type_code || item.deduction_code || item.code || item.deduction_name) === 'CHUYEN_MA' && num(item.hours) > 0
  ).length;

  return {
    ok,
    totalNg,
    actualTime,
    totalTime,
    trainingPercent,
    standardOutput,
    actualOutput,
    outputPerHour,
    achievement,
    ngRate,
    deductionTotal,
    changeCount
  };
}


  return { getMetrics };
}
module.exports = { createCompanyExcelMetrics };
