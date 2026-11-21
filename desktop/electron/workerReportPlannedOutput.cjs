'use strict';

const { resolveWorkerParticipationTimes } = require('./exportMachineTime.cjs');

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';
const toNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Calculate the historical planned output independently of workbook rendering. */
function plannedOutputFor(report) {
  const trainingPercent = hasValue(report.training_percent_snapshot)
    ? toNumber(report.training_percent_snapshot)
    : hasValue(report.training_percent) ? toNumber(report.training_percent) : 100;
  const exportTimes = resolveWorkerParticipationTimes(report);
  const effectiveTime = exportTimes.hasMachine
    ? exportTimes.actualHours
    : hasValue(report.actual_time)
      ? toNumber(report.actual_time)
      : hasValue(report.total_time)
        ? toNumber(report.total_time) - toNumber(report.deduction_time)
        : null;
  const perHour = hasValue(report.standard_output) ? toNumber(report.standard_output) : null;
  const planned = perHour === null || effectiveTime === null
    ? null
    : Math.round(perHour * effectiveTime * (trainingPercent / 100) * 100) / 100;
  return { planned, trainingPercent };
}

module.exports = { plannedOutputFor };
