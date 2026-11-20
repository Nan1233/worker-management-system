'use strict';

// Pure company workbook metrics. Approved report snapshots take precedence over mutable master data.
function createCompanyExcelMetrics({ num, normalizeCode, safeText }) {
function sumDetails(items, valueKey) {
  return (items || []).reduce((sum, item) => sum + num(item?.[valueKey]), 0);
}

function getMetrics(report) {
  const ok = num(report.tt_ok ?? report.ok_quantity ?? report.ok);
  const totalNg = sumDetails(report.defects, 'quantity');
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
    : (num(report.total_time) || (num(report.actual_time ?? report.working_time ?? report.work_time) + sumDetails(report.deductions, 'hours')));
  const actualTime = isGiaCongMachine
    ? (hasValue(report.actual_time) ? Math.max(0, num(report.actual_time)) : Math.max(0, workerTotalTime - workerDeductionTime))
    : num(report.actual_time ?? report.working_time ?? report.work_time);
  // Approved historical snapshot takes precedence over mutable worker master data.
  const snapshot = report.training_percent_snapshot;
  const trainingSource = snapshot !== null && snapshot !== undefined && String(snapshot).trim() !== ''
    ? snapshot : report.training_percent;
  const rawTraining = trainingSource === null || trainingSource === undefined || String(trainingSource).trim() === ''
    ? 100 : num(trainingSource);
  const trainingPercent = Math.min(100, Math.max(0, rawTraining));
  const trainingFactor = trainingPercent / 100;
  // Không làm tròn định mức theo giờ. Nhiều mã có định mức thập phân
  // (ví dụ 6.315789 SP/giờ); làm tròn sẽ khiến TT và tỷ lệ đạt sai.
  const standardOutput = num(report.standard_output ?? report.standard_output_per_hour ?? report.standard);
  const countedNg = (report.defects || []).reduce((sum, item) => {
    return sum + num(item.quantity);
  }, 0);
  const hasActualOutput = report.actual_output !== null && report.actual_output !== undefined && safeText(report.actual_output).trim() !== '';
  const actualOutput = hasActualOutput ? num(report.actual_output) : ok + countedNg;
  const outputPerHour = actualTime > 0 ? actualOutput / actualTime : 0;
  const achievement = standardOutput > 0 ? outputPerHour / standardOutput : 0;
  const ngRate = (ok + totalNg) > 0 ? totalNg / (ok + totalNg) : 0;
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
