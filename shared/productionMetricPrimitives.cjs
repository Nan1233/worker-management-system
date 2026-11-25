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
    enteredOutput += lineOk + lineNg;
    adjustedOutput += lineOk + lineCountedNg;
    if (trainingMultiplier !== null) plannedOutput += Math.round(calculatePlannedOutput(lineStandard, workedHours, trainingMultiplier));
  }

  const outputPerHour = safeRatio(adjustedOutput, actualTime);
  const plannedAvailable = !resolved.apply_training_percent || factor !== null;
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


module.exports = {
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
