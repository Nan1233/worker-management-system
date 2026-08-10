'use strict';

const DEFAULT_SETTINGS = Object.freeze({
  apply_training_percent: 1,
  output_formula: 'ENTERED_X_TRAINING',
  output_per_hour_formula: 'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME',
  achievement_formula: 'OUTPUT_PER_HOUR_DIV_STANDARD',
  ng_rate_formula: 'NG_DIV_OK_PLUS_NG',
  actual_time_formula: 'DATABASE_SNAPSHOT'
});

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function asInteger(value) {
  const number = asNumber(value);
  return number === null ? null : Math.round(number);
}

function normalizeTrainingPercent(value, defaultPercent = 100) {
  if (value === null || value === undefined) return defaultPercent;
  if (typeof value === 'string' && value.trim() === '') return defaultPercent;
  const number = asNumber(value);
  if (number === null) return defaultPercent;
  return Math.min(100, Math.max(0, number));
}

function trainingFactor(value, defaultPercent = 100) {
  return normalizeTrainingPercent(value, defaultPercent) / 100;
}

function normalizeCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

function defectQuantity(item) {
  return asInteger(item?.quantity) || 0;
}

function defectCode(item) {
  return normalizeCode(
    item?.defect_type_code || item?.defect_code || item?.code || item?.defect_type_name || item?.name
  );
}

function calculateNg(report = {}) {
  const details = Array.isArray(report.defects) ? report.defects : [];
  const excludeKqd = Number(report.exclude_kqd_from_tt || 0) === 1;

  if (!details.length) {
    const total = asInteger(report.tt_ng);
    return {
      allNg: total,
      countedNg: total,
      excludedKqd: 0,
      excludeKqd
    };
  }

  let allNg = 0;
  let countedNg = 0;
  let excludedKqd = 0;
  for (const item of details) {
    const quantity = defectQuantity(item);
    allNg += quantity;
    if (excludeKqd && defectCode(item) === 'KQD') excludedKqd += quantity;
    else countedNg += quantity;
  }

  return { allNg, countedNg, excludedKqd, excludeKqd };
}

function machineLineHours(report = {}) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  return lines.reduce((sum, line) => (
    sum + (asNumber(line?.hours ?? line?.actual_time ?? line?.machine_time) || 0)
  ), 0);
}

function resolveSettings(settings = {}) {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

function calculateActualTime(report = {}, settings = {}, workingTime = null, deductionTime = null) {
  const resolved = resolveSettings(settings);
  const working = workingTime === null ? asNumber(report.total_time) : asNumber(workingTime);
  const deduction = deductionTime === null ? asNumber(report.deduction_time) : asNumber(deductionTime);

  if (resolved.actual_time_formula === 'WORKING_MINUS_DEDUCTION') {
    return working === null ? null : Math.max(0, working - (deduction || 0));
  }
  if (resolved.actual_time_formula === 'MACHINE_LINES_SUM') {
    const sum = machineLineHours(report);
    return sum > 0 ? sum : asNumber(report.actual_time);
  }
  return asNumber(report.actual_time);
}

function calculateAdjustedOutput({ enteredOutput, ok, countedNg, factor, settings = {} }) {
  const resolved = resolveSettings(settings);
  let output = null;
  if (resolved.output_formula === 'ENTERED_OUTPUT') output = enteredOutput;
  else if (resolved.output_formula === 'OK_PLUS_NG') {
    output = ok !== null && countedNg !== null ? ok + countedNg : null;
  } else if (resolved.output_formula === 'OK_X_TRAINING') {
    output = ok === null ? null : ok * (resolved.apply_training_percent ? factor : 1);
  } else {
    output = enteredOutput === null ? null : enteredOutput * (resolved.apply_training_percent ? factor : 1);
  }
  return output === null ? null : Math.round(output);
}

function calculateProductionMetrics(report = {}, settings = {}) {
  const resolved = resolveSettings(settings);
  const workingTime = asNumber(report.total_time);
  const deductionTime = asNumber(report.deduction_time);
  const actualTime = calculateActualTime(report, resolved, workingTime, deductionTime);
  const ok = asInteger(report.tt_ok);
  const ng = calculateNg(report);
  const fallbackEnteredOutput = ok !== null && ng.countedNg !== null ? ok + ng.countedNg : null;
  const enteredOutput = asInteger(report.actual_output ?? fallbackEnteredOutput);
  const trainingPercent = normalizeTrainingPercent(report.training_percent);
  const factor = trainingPercent / 100;
  const standard = asNumber(report.standard_output);
  const machinePerformance = report.machinePerformance || report.machine_performance || null;
  const hasMachinePerformance = Number(machinePerformance?.machine_count || 0) > 0;

  let adjustedOutput = calculateAdjustedOutput({
    enteredOutput,
    ok,
    countedNg: ng.countedNg,
    factor,
    settings: resolved
  });
  let outputPerHour = null;
  let achievement = null;
  let plannedOutput = standard !== null && actualTime !== null
    ? standard * actualTime * (resolved.apply_training_percent ? factor : 1)
    : null;

  // Multi-machine reports already carry a validated aggregate snapshot from the backend.
  // Preserve that physical machine result while exposing it through the same metrics contract.
  if (hasMachinePerformance) {
    adjustedOutput = asNumber(machinePerformance.counted_output);
    plannedOutput = asNumber(machinePerformance.maximum_output);
    outputPerHour = actualTime && adjustedOutput !== null ? adjustedOutput / actualTime : null;
    achievement = plannedOutput ? adjustedOutput / plannedOutput : null;
  } else {
    const perHourNumerator = resolved.output_per_hour_formula === 'ENTERED_OUTPUT_DIV_ACTUAL_TIME'
      ? enteredOutput
      : adjustedOutput;
    outputPerHour = actualTime && perHourNumerator !== null ? perHourNumerator / actualTime : null;
    achievement = resolved.achievement_formula === 'OUTPUT_PER_HOUR_DIV_STANDARD' && outputPerHour !== null && standard
      ? outputPerHour / standard
      : null;
  }

  let ngRate = null;
  if (resolved.ng_rate_formula === 'NG_DIV_ENTERED_OUTPUT') {
    ngRate = enteredOutput ? ng.allNg / enteredOutput : null;
  } else {
    const denominator = ok !== null && ng.allNg !== null ? ok + ng.allNg : null;
    ngRate = denominator ? ng.allNg / denominator : null;
  }

  return {
    trainingPercent,
    trainingFactor: factor,
    workingTime,
    deductionTime,
    actualTime,
    ok,
    allNg: ng.allNg,
    countedNg: ng.countedNg,
    excludedKqd: ng.excludedKqd,
    enteredOutput,
    adjustedOutput,
    standard,
    plannedOutput,
    outputPerHour,
    achievement,
    ngRate,
    hasMachinePerformance
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  asNumber,
  asInteger,
  normalizeTrainingPercent,
  trainingFactor,
  calculateNg,
  machineLineHours,
  resolveSettings,
  calculateActualTime,
  calculateAdjustedOutput,
  calculateProductionMetrics
};
