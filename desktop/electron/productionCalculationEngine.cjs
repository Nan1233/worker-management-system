'use strict';

const { isKqdDefect } = require('../../shared/kqdPolicy.cjs');

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
  return normalizeCode(item?.defect_type_code || item?.defect_code || item?.code);
}

function calculateNg(report = {}) {
  const details = Array.isArray(report.defects) ? report.defects : [];
  const hasKqdSnapshot = Object.prototype.hasOwnProperty.call(report, 'exclude_kqd_from_tt_snapshot');
  const kqdPolicyValue = hasKqdSnapshot ? report.exclude_kqd_from_tt_snapshot : report.exclude_kqd_from_tt;
  const excludeKqd = Number(kqdPolicyValue || 0) === 1;

  // production_reports.tt_ng is the database snapshot used by the approved
  // report. When details are present, keep the detail totals available for
  // diagnostics, but do not replace the DB value during Excel export.
  const databaseNg = asInteger(report.tt_ng);
  if (!details.length) {
    return {
      allNg: databaseNg,
      countedNg: databaseNg,
      excludedKqd: 0,
      excludeKqd
    };
  }

  let detailNg = 0;
  let excludedKqd = 0;
  for (const item of details) {
    const quantity = defectQuantity(item);
    detailNg += quantity;
    if (excludeKqd && isKqdDefect({ defect_code: defectCode(item) })) excludedKqd += quantity;
  }

  return {
    allNg: databaseNg,
    countedNg: databaseNg,
    excludedKqd,
    detailNg,
    excludeKqd
  };
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
  // For approved database reports, actual_time is an immutable DB snapshot.
  // Never recompute it from working/deduction hours for Excel export.
  const databaseActualTime = asNumber(report.actual_time);
  if (databaseActualTime !== null) return databaseActualTime;

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
  return databaseActualTime;
}

function calculateAdjustedOutput({ enteredOutput, ok, countedNg, factor, settings = {}, databaseOutput = null }) {
  // actual_output is stored by the report and must be preserved in Excel.
  if (databaseOutput !== null && databaseOutput !== undefined) return asInteger(databaseOutput);

  const resolved = resolveSettings(settings);
  let output = null;
  if (resolved.output_formula === 'ENTERED_OUTPUT') output = enteredOutput;
  else if (resolved.output_formula === 'OK_PLUS_NG') {
    output = ok !== null && countedNg !== null ? ok + countedNg : null;
  } else if (resolved.output_formula === 'OK_X_TRAINING') {
    output = ok === null || (resolved.apply_training_percent && factor === null) ? null : ok * (resolved.apply_training_percent ? factor : 1);
  } else {
    output = enteredOutput === null || (resolved.apply_training_percent && factor === null) ? null : enteredOutput * (resolved.apply_training_percent ? factor : 1);
  }
  return output === null ? null : Math.round(output);
}

function calculateProductionMetrics(report = {}, settings = {}) {
  const resolved = resolveSettings(settings);

  // These values are database columns. They are deliberately read directly
  // and are not recalculated for Excel. This keeps Desktop output identical to
  // the approved production_reports record.
  const workingTime = asNumber(report.total_time);
  const deductionTime = asNumber(report.deduction_time);
  const actualTime = asNumber(report.actual_time);
  const ok = asInteger(report.tt_ok);
  const ng = calculateNg(report);
  const enteredOutput = asInteger(report.actual_output);
  const trainingPercent = Object.prototype.hasOwnProperty.call(report, 'training_percent_snapshot')
    && (report.training_percent_snapshot === null || report.training_percent_snapshot === undefined || String(report.training_percent_snapshot).trim() === '')
    ? null
    : normalizeTrainingPercent(
      Object.prototype.hasOwnProperty.call(report, 'training_percent_snapshot')
        ? report.training_percent_snapshot
        : report.training_percent
    );
  const factor = trainingPercent === null ? null : trainingPercent / 100;
  const standard = asNumber(report.standard_output);
  const machinePerformance = report.machinePerformance || report.machine_performance || null;
  const hasMachinePerformance = Number(machinePerformance?.machine_count || 0) > 0;

  const adjustedOutput = calculateAdjustedOutput({
    enteredOutput,
    ok,
    countedNg: ng.countedNg,
    factor,
    settings: resolved,
    databaseOutput: enteredOutput
  });

  let outputPerHour = null;
  let achievement = null;
  let plannedOutput = null;

  if (hasMachinePerformance) {
    // Machine performance is itself a backend snapshot. Preserve it when it
    // exists, otherwise use the DB report fields above.
    outputPerHour = actualTime && adjustedOutput !== null ? adjustedOutput / actualTime : null;
    plannedOutput = asNumber(machinePerformance.maximum_output);
    achievement = plannedOutput ? adjustedOutput / plannedOutput : null;
  } else {
    outputPerHour = actualTime && adjustedOutput !== null ? adjustedOutput / actualTime : null;
    achievement = outputPerHour !== null && standard ? outputPerHour / standard : null;
    plannedOutput = standard !== null && actualTime !== null && factor !== null
      ? standard * actualTime * factor
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
    trainingSnapshotAvailable: !(
      Object.prototype.hasOwnProperty.call(report, 'training_percent_snapshot')
      && (report.training_percent_snapshot === null || report.training_percent_snapshot === undefined || String(report.training_percent_snapshot).trim() === '')
    ),
    workingTime,
    deductionTime,
    actualTime,
    ok,
    allNg: ng.allNg,
    countedNg: ng.countedNg,
    excludedKqd: ng.excludedKqd,
    detailNg: ng.detailNg,
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
