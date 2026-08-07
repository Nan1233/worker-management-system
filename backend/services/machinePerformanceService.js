"use strict";

const safeNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const parseDefects = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const isKqdDefect = (defect) => {
  const code = String(defect?.defect_code || defect?.code || "").trim().toUpperCase();
  const name = String(defect?.defect_name || defect?.name || "").trim().toUpperCase();
  return code === "KQD" || code.startsWith("KQD_") || name.includes("KQD");
};

const calculateMachineLinePerformance = (line = {}) => {
  const ok = Math.max(0, safeNumber(line.ok_quantity));
  const defects = parseDefects(line.defects ?? line.defects_json);
  const detailedNg = defects.reduce((sum, defect) => sum + Math.max(0, safeNumber(defect?.quantity)), 0);
  const ng = detailedNg > 0 ? detailedNg : Math.max(0, safeNumber(line.ng_quantity));
  const excludeKqd = Number(line.exclude_kqd_from_tt || 0) === 1;
  const excludedKqd = excludeKqd
    ? defects.reduce((sum, defect) => sum + (isKqdDefect(defect) ? Math.max(0, safeNumber(defect?.quantity)) : 0), 0)
    : 0;
  const countedNg = Math.max(0, ng - excludedKqd);
  const physicalOutput = ok + ng;
  const countedOutput = ok + countedNg;
  const machineHours = Math.max(0, safeNumber(line.machine_time_hours));
  const standardOutput = Math.max(0, safeNumber(line.standard_output));
  const maximumOutput = Math.max(0, safeNumber(line.maximum_output)) || standardOutput * machineHours;
  const earnedStandardHours = standardOutput > 0 ? countedOutput / standardOutput : 0;

  return {
    ...line,
    defects,
    ok_quantity: ok,
    ng_quantity: ng,
    excluded_kqd_quantity: excludedKqd,
    counted_ng_quantity: countedNg,
    physical_output: physicalOutput,
    counted_output: countedOutput,
    maximum_output: maximumOutput,
    earned_standard_hours: earnedStandardHours,
    machine_efficiency_percent: maximumOutput > 0 ? (countedOutput / maximumOutput) * 100 : 0,
    ok_rate_percent: physicalOutput > 0 ? (ok / physicalOutput) * 100 : 0,
    ng_rate_percent: physicalOutput > 0 ? (ng / physicalOutput) * 100 : 0,
  };
};

const calculateManualPerformance = (report = {}) => {
  const ok = Math.max(0, safeNumber(report.tt_ok));
  const ng = Math.max(0, safeNumber(report.tt_ng));
  const physicalOutput = ok + ng;
  const countedOutput = Math.max(0, safeNumber(report.actual_output)) || physicalOutput;
  const standardOutput = Math.max(0, safeNumber(report.standard_output));
  const actualWorkerHours = Math.max(0, safeNumber(report.actual_time));
  const maximumOutput = standardOutput * actualWorkerHours;
  const earnedStandardHours = standardOutput > 0 ? countedOutput / standardOutput : 0;

  return {
    performanceMode: "MANUAL",
    machine_lines: [],
    manualPerformance: {
      product_code: String(report.product_name || "").trim() || null,
      standard_source: "PRODUCT",
      standard_output: standardOutput,
      total_ok: ok,
      total_ng: ng,
      physical_output: physicalOutput,
      counted_output: countedOutput,
      maximum_output: maximumOutput,
      efficiency_percent: maximumOutput > 0 ? (countedOutput / maximumOutput) * 100 : 0,
      ok_rate_percent: physicalOutput > 0 ? (ok / physicalOutput) * 100 : 0,
      ng_rate_percent: physicalOutput > 0 ? (ng / physicalOutput) * 100 : 0,
    },
    machinePerformance: null,
    workerPerformance: {
      actual_worker_hours: actualWorkerHours,
      earned_standard_hours: earnedStandardHours,
      efficiency_percent: actualWorkerHours > 0 ? (earnedStandardHours / actualWorkerHours) * 100 : 0,
    },
  };
};

const calculateReportPerformance = ({ report = {}, machineLines = [] } = {}) => {
  const rawLines = Array.isArray(machineLines) ? machineLines : [];
  const mode = String(report.operation_mode || "").trim().toUpperCase();
  if (mode === "MANUAL" || rawLines.length === 0) {
    return calculateManualPerformance(report);
  }

  const lines = rawLines.map(calculateMachineLinePerformance);
  const machineCount = lines.length;
  const totalOk = lines.reduce((sum, line) => sum + line.ok_quantity, 0);
  const totalNg = lines.reduce((sum, line) => sum + line.ng_quantity, 0);
  const physicalOutput = lines.reduce((sum, line) => sum + line.physical_output, 0);
  const countedOutput = lines.reduce((sum, line) => sum + line.counted_output, 0);
  const maximumOutput = lines.reduce((sum, line) => sum + line.maximum_output, 0);
  const earnedStandardHours = lines.reduce((sum, line) => sum + line.earned_standard_hours, 0);
  const totalMachineHours = lines.reduce((sum, line) => sum + Math.max(0, safeNumber(line.machine_time_hours)), 0);
  const actualWorkerHours = Math.max(0, safeNumber(report.actual_time));

  return {
    performanceMode: "MACHINE",
    machine_lines: lines,
    manualPerformance: null,
    machinePerformance: {
      machine_count: machineCount,
      total_machine_hours: totalMachineHours,
      total_ok: totalOk,
      total_ng: totalNg,
      physical_output: physicalOutput,
      counted_output: countedOutput,
      maximum_output: maximumOutput,
      efficiency_percent: maximumOutput > 0 ? (countedOutput / maximumOutput) * 100 : 0,
      ok_rate_percent: physicalOutput > 0 ? (totalOk / physicalOutput) * 100 : 0,
      ng_rate_percent: physicalOutput > 0 ? (totalNg / physicalOutput) * 100 : 0,
    },
    workerPerformance: {
      actual_worker_hours: actualWorkerHours,
      earned_standard_hours: earnedStandardHours,
      efficiency_percent: actualWorkerHours > 0 ? (earnedStandardHours / actualWorkerHours) * 100 : 0,
    },
  };
};

module.exports = {
  parseDefects,
  isKqdDefect,
  calculateMachineLinePerformance,
  calculateManualPerformance,
  calculateReportPerformance,
};
