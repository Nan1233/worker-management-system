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

function defectQuantity(item) {
  return asInteger(item?.quantity) || 0;
}

function calculateNg(report = {}) {
  const details = Array.isArray(report.defects) ? report.defects : [];
  const databaseNg = asInteger(report.tt_ng);
  if (!details.length) return { allNg: databaseNg, countedNg: databaseNg };
  const detailNg = details.reduce((sum, item) => sum + defectQuantity(item), 0);
  const allNg = databaseNg === null ? detailNg : databaseNg;
  return { allNg, countedNg: allNg, detailNg };
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

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function positiveHours(value) {
  return Math.max(0, asNumber(value) || 0);
}

// GC MACHINE stores Worker credit on machine lines and intentionally writes
// zero to the parent report's time/output fields. Aggregate the line-level
// Worker values here; never substitute shared physical event hours.
function calculateGcMachineLineMetrics(report, resolved, trainingPercent, factor, snapshotMissing) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  if (!lines.length) return null;

  const positiveDetails = (value) => parseArray(value)
    .map((item) => ({ ...item, hours: positiveHours(item?.hours) }))
    .filter((item) => item.hours > 0);
  const reportDeductions = positiveDetails(report.deductions);
  const allowReportFallback = lines.length === 1;
  let workingTime = 0;
  let deductionTime = 0;
  let actualTime = 0;
  let ok = 0;
  let allNg = 0;
  let countedNg = 0;
  let excludedKqd = 0;
  let enteredOutput = 0;
  let adjustedOutput = 0;
  let plannedOutput = 0;

  for (const line of lines) {
    const machineHours = positiveHours(line.machine_time_hours);
    const lineDeductions = positiveDetails(
      parseArray(line.deductions).length ? line.deductions : line.deductions_json
    );
    const reportLineDeductions = lineDeductions.length
      ? lineDeductions
      : (allowReportFallback ? reportDeductions : []);
    const detailHours = reportLineDeductions.reduce((sum, item) => sum + item.hours, 0);
    const fallbackHours = Math.max(
      positiveHours(line.deduction_time_hours),
      positiveHours(line.adjustment_minutes) / 60,
      allowReportFallback && !reportLineDeductions.length ? positiveHours(report.deduction_time) : 0
    );
    const deductionHours = reportLineDeductions.length ? detailHours : fallbackHours;
    const workedHours = Math.max(0, machineHours - deductionHours);

    const lineOk = Math.max(0, asInteger(line.ok_quantity) || 0);
    const lineNg = Math.max(0, asInteger(line.ng_quantity) || 0);
    const lineDefects = parseArray(line.defects).length
      ? parseArray(line.defects)
      : parseArray(line.defects_json);
    const lineCountedNg = lineNg;
    const lineStandard = positiveHours(line.standard_output);
    const trainingMultiplier = resolved.apply_training_percent
      ? (factor === null ? null : factor)
      : 1;

    workingTime += machineHours;
    deductionTime += deductionHours;
    actualTime += workedHours;
    ok += lineOk;
    allNg += lineNg;
    countedNg += lineCountedNg;
    excludedKqd += lineExcludedKqd;
    enteredOutput += lineOk + lineNg;
    adjustedOutput += lineOk + lineCountedNg;
    if (trainingMultiplier !== null) plannedOutput += Math.round(lineStandard * workedHours * trainingMultiplier);
  }

  const outputPerHour = actualTime > 0 ? adjustedOutput / actualTime : null;
  const plannedAvailable = !resolved.apply_training_percent || factor !== null;
  const resolvedPlannedOutput = plannedAvailable ? plannedOutput : null;
  const standard = actualTime > 0 && resolvedPlannedOutput !== null
    ? resolvedPlannedOutput / actualTime
    : null;
  const achievement = resolvedPlannedOutput > 0 ? adjustedOutput / resolvedPlannedOutput : null;
  const ngDenominator = ok + allNg;
  const ngRate = resolved.ng_rate_formula === 'NG_DIV_ENTERED_OUTPUT'
    ? (enteredOutput > 0 ? allNg / enteredOutput : null)
    : (ngDenominator > 0 ? allNg / ngDenominator : null);

  return {
    trainingPercent,
    trainingFactor: factor,
    trainingSnapshotAvailable: !snapshotMissing,
    workingTime,
    deductionTime,
    actualTime,
    ok,
    allNg,
    countedNg,
    excludedKqd,
    enteredOutput,
    adjustedOutput,
    standard,
    plannedOutput: resolvedPlannedOutput,
    outputPerHour,
    achievement,
    ngRate,
    hasMachinePerformance: false
  };
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
  const hasTrainingSnapshot = Object.prototype.hasOwnProperty.call(report, 'training_percent_snapshot');
  const snapshotMissing = hasTrainingSnapshot
    && (report.training_percent_snapshot === null
      || report.training_percent_snapshot === undefined
      || String(report.training_percent_snapshot).trim() === '');
  const trainingPercent = snapshotMissing
    ? null
    : normalizeTrainingPercent(
      hasTrainingSnapshot ? report.training_percent_snapshot : report.training_percent
    );
  const factor = trainingPercent === null ? null : trainingPercent / 100;
  const standard = asNumber(report.standard_output);
  const isGcMachineReport = normalizeCode(report.process_code) === 'GC'
    && normalizeCode(report.operation_mode) === 'MACHINE';
  if (isGcMachineReport) {
    const gcMetrics = calculateGcMachineLineMetrics(report, resolved, trainingPercent, factor, snapshotMissing);
    if (gcMetrics) return gcMetrics;
  }

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
