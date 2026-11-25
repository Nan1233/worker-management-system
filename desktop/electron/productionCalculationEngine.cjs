'use strict';

const {
  DEFAULT_SETTINGS,
  parseStoredTrainingSnapshot,
  safeRatio,
  calculateNetHours,
  calculateGcMachineLineMetrics,
  calculatePlannedOutput,
  asNumber,
  asInteger,
  normalizeTrainingPercent,
  trainingFactor
} = require(typeof process.resourcesPath === 'string' && require('node:fs').existsSync(require('node:path').join(process.resourcesPath, 'shared', 'productionMetricPrimitives.cjs')) ? require('node:path').join(process.resourcesPath, 'shared', 'productionMetricPrimitives.cjs') : '../../shared/productionMetricPrimitives.cjs');

// Process/operation codes are compared case-insensitively (e.g. 'gc' / 'GC',
// 'machine' / 'MACHINE'). Restored after 7d2fe072 removed it while
// calculateProductionMetrics still depends on it.
function normalizeCode(value) {
  return String(value ?? '').trim().toUpperCase();
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
    return working === null ? null : calculateNetHours(working, deduction ?? 0);
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
  const trainingPercent = parseStoredTrainingSnapshot(report.training_percent_snapshot);
  const snapshotMissing = trainingPercent === null;
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
