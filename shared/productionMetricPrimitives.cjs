'use strict';

// Shared, environment-independent primitives for backend calculations and
// Desktop Excel snapshots. The engines intentionally retain separate rules
// for approved database snapshots versus editable report calculations.
const DEFAULT_SETTINGS = Object.freeze({
  apply_training_percent: 1,
  output_formula: 'ENTERED_X_TRAINING',
  output_per_hour_formula: 'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME',
  achievement_formula: 'OUTPUT_PER_HOUR_DIV_STANDARD',
  ng_rate_formula: 'NG_DIV_OK_PLUS_NG',
  actual_time_formula: 'DATABASE_SNAPSHOT'
});

function asNumber(value) {
  if (value === null || value === undefined || !['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
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

// Historical snapshots must not be clamped or replaced with current master data.
function parseStoredTrainingSnapshot(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function safeRatio(numerator, denominator) {
  if (numerator === null || numerator === undefined || denominator === null || denominator === undefined) return null;
  const n = asNumber(numerator);
  const d = asNumber(denominator);
  return n !== null && n >= 0 && d !== null && d > 0 ? n / d : null;
}

// Net participation hours are distinct from physical machine hours.
function calculateNetHours(gross, deduction = 0) {
  const hours = asNumber(gross);
  const excluded = asNumber(deduction);
  if (hours === null || excluded === null) return null;
  return Math.max(0, Math.max(0, hours) - Math.max(0, excluded));
}

// Factor is explicit: physical capacity uses 1, training targets use the snapshot factor.
function calculatePlannedOutput(standard, hours, factor = 1) {
  const rate = asNumber(standard);
  const time = asNumber(hours);
  const multiplier = asNumber(factor);
  if ([rate, time, multiplier].some(value => value === null || value < 0)) return null;
  return rate * time * multiplier;
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
  const lines = Array.isArray(report.machineLines) ? report.machineLines : Array.isArray(report.machine_lines) ? report.machine_lines : [];
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
  let enteredOutput = 0;
  let adjustedOutput = 0;
  let plannedOutput = 0;
  let missingStandard = false;

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
    const workedHours = calculateNetHours(machineHours, deductionHours) ?? 0;

    const lineOk = Math.max(0, asInteger(line.ok_quantity) || 0);
    const lineNg = Math.max(0, asInteger(line.ng_quantity) || 0);
    const lineCountedNg = lineNg;
    const lineStandard = asNumber(line.standard_output);
    if (workedHours > 0 && (lineStandard === null || lineStandard < 0)) missingStandard = true;
    const trainingMultiplier = resolved.apply_training_percent
      ? (factor === null ? null : factor)
      : 1;

    workingTime += machineHours;
    deductionTime += deductionHours;
    actualTime += workedHours;
    ok += lineOk;
    allNg += lineNg;
    countedNg += lineCountedNg;
    enteredOutput += lineOk + lineNg;
    adjustedOutput += lineOk + lineCountedNg;
    if (trainingMultiplier !== null && lineStandard !== null && lineStandard >= 0) plannedOutput += Math.round(calculatePlannedOutput(lineStandard, workedHours, trainingMultiplier));
  }

  const outputPerHour = safeRatio(adjustedOutput, actualTime);
  const plannedAvailable = !missingStandard && (!resolved.apply_training_percent || factor !== null);
  const resolvedPlannedOutput = plannedAvailable ? plannedOutput : null;
  const standard = actualTime > 0 && resolvedPlannedOutput !== null
    ? resolvedPlannedOutput / actualTime
    : null;
  const achievement = safeRatio(adjustedOutput, resolvedPlannedOutput);
  const ngDenominator = ok + allNg;
  const ngRate = resolved.ng_rate_formula === 'NG_DIV_ENTERED_OUTPUT'
    ? safeRatio(allNg, enteredOutput)
    : safeRatio(allNg, ngDenominator);

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


function defectQuantity(item) {
  return asInteger(item?.quantity) || 0;
}

function calculateStoredNg(report = {}) {
  const details = Array.isArray(report.defects) ? report.defects : [];
  const databaseNg = asInteger(report.tt_ng);
  if (!details.length) return { allNg: databaseNg, countedNg: databaseNg };
  const detailNg = details.reduce((sum, item) => sum + defectQuantity(item), 0);
  const allNg = databaseNg === null ? detailNg : databaseNg;
  return { allNg, countedNg: allNg, detailNg };
}

function calculateStoredAdjustedOutput({ enteredOutput, ok, countedNg, factor, settings = {}, databaseOutput = null }) {
  // actual_output is stored by the report and must be preserved in Excel.
  if (databaseOutput !== null && databaseOutput !== undefined) return asInteger(databaseOutput);

  const resolved = { ...DEFAULT_SETTINGS, ...(settings || {}) };
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

function calculateStoredProductionMetrics(report = {}, settings = {}) {
  const resolved = { ...DEFAULT_SETTINGS, ...(settings || {}) };

  // These values are database columns. They are deliberately read directly
  // and are not recalculated for Excel. This keeps Desktop output identical to
  // the approved production_reports record.
  const workingTime = asNumber(report.total_time);
  const deductionTime = asNumber(report.deduction_time);
  const actualTime = asNumber(report.actual_time);
  const ok = asInteger(report.tt_ok);
  const ng = calculateStoredNg(report);
  const enteredOutput = asInteger(report.actual_output);
  const trainingPercent = parseStoredTrainingSnapshot(report.training_percent_snapshot);
  const snapshotMissing = trainingPercent === null;
  const factor = trainingPercent === null ? null : trainingPercent / 100;
  const standard = asNumber(report.standard_output);
  const isGcMachineReport = String(report.process_code ?? '').trim().toUpperCase() === 'GC'
    && String(report.operation_mode ?? '').trim().toUpperCase() === 'MACHINE';
  if (isGcMachineReport) {
    const gcMetrics = calculateGcMachineLineMetrics(report, resolved, trainingPercent, factor, snapshotMissing);
    if (gcMetrics) return gcMetrics;
    // Parent zeroes are placeholders for GC machine reports without available lines.
    return { trainingPercent, trainingFactor: factor, trainingSnapshotAvailable: !snapshotMissing, workingTime: null, deductionTime: null, actualTime: null, ok: null, allNg: null, countedNg: null, enteredOutput: null, adjustedOutput: null, standard: null, plannedOutput: null, outputPerHour: null, achievement: null, ngRate: null, hasMachinePerformance: false };
  }

  const machinePerformance = report.machinePerformance || report.machine_performance || null;
  const hasMachinePerformance = Number(machinePerformance?.machine_count || 0) > 0;

  const adjustedOutput = calculateStoredAdjustedOutput({
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
    outputPerHour = safeRatio(adjustedOutput, actualTime);
    plannedOutput = asNumber(machinePerformance.maximum_output);
    achievement = safeRatio(adjustedOutput, plannedOutput);
  } else {
    outputPerHour = safeRatio(adjustedOutput, actualTime);
    achievement = safeRatio(outputPerHour, standard);
    plannedOutput = calculatePlannedOutput(standard, actualTime, resolved.apply_training_percent ? factor : 1);
  }

  let ngRate = null;
  if (resolved.ng_rate_formula === 'NG_DIV_ENTERED_OUTPUT') {
    ngRate = safeRatio(ng.allNg, enteredOutput);
  } else {
    const denominator = ok !== null && ng.allNg !== null ? ok + ng.allNg : null;
    ngRate = safeRatio(ng.allNg, denominator);
  }

  return {
    trainingPercent,
    trainingFactor: factor,
    trainingSnapshotAvailable: !snapshotMissing,
    workingTime,
    deductionTime,
    actualTime,
    ok,
    allNg: ng.allNg,
    countedNg: ng.countedNg,
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
  calculateStoredProductionMetrics,
  calculateGcMachineLineMetrics,
  calculateNetHours,
  calculatePlannedOutput,
  parseStoredTrainingSnapshot,
  safeRatio,
  DEFAULT_SETTINGS,
  asNumber,
  asInteger,
  normalizeTrainingPercent,
  trainingFactor
};
