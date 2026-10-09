"use strict";

const { isKqdDefect } = require("../../shared/kqdPolicy.cjs");

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

const aggregateMachineDefects = (lines = []) => {
  const merged = new Map();
  for (const line of lines) {
    for (const defect of parseDefects(line?.defects ?? line?.defects_json)) {
      const quantity = Math.max(0, safeNumber(defect?.quantity));
      if (quantity <= 0) continue;
      const defectTypeId = Number(defect?.defect_type_id || defect?.id) || null;
      const code = String(defect?.defect_code || defect?.code || "").trim();
      const name = String(defect?.defect_name || defect?.name || "").trim();
      const key = defectTypeId ? `ID:${defectTypeId}` : code ? `CODE:${code}` : name ? `NAME:${name}` : null;
      if (!key) continue;
      const existing = merged.get(key);
      if (existing) existing.quantity += quantity;
      else merged.set(key, { defect_type_id: defectTypeId, defect_code: code || null, defect_name: name || null, quantity });
    }
  }
  return [...merged.values()];
};

const calculateMachineLinePerformance = (line = {}) => {
  const ok = Math.max(0, safeNumber(line.ok_quantity));
  // Production quantity is authoritative from the saved report line.
  // Defect detail is a breakdown and must never rewrite the saved NG total.
  const defects = parseDefects(line.defects ?? line.defects_json);
  const ng = Math.max(0, safeNumber(line.ng_quantity));
  const excludeKqd = Number(line.exclude_kqd_from_tt || 0) === 1;
  const excludedKqd = excludeKqd ? defects.reduce((sum, defect) => sum + (isKqdDefect(defect) ? Math.max(0, safeNumber(defect?.quantity)) : 0), 0) : 0;
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
  if (mode === "MANUAL" || rawLines.length === 0) return calculateManualPerformance(report);

  const lines = rawLines.map(calculateMachineLinePerformance);
  const machineCount = lines.length;
  const totalOk = lines.reduce((sum, line) => sum + line.ok_quantity, 0);
  const totalNg = lines.reduce((sum, line) => sum + line.ng_quantity, 0);
  const physicalOutput = lines.reduce((sum, line) => sum + line.physical_output, 0);
  const countedOutput = lines.reduce((sum, line) => sum + line.counted_output, 0);
  const maximumOutput = lines.reduce((sum, line) => sum + line.maximum_output, 0);
  const earnedStandardHours = lines.reduce((sum, line) => sum + line.earned_standard_hours, 0);
  const totalMachineHours = lines.reduce((sum, line) => sum + Math.max(0, safeNumber(line.machine_time_hours)), 0);
  // GC nhiều máy không còn thu thập actual_time cấp báo cáo (xem reportValidation.js:
  // isGiaCongMachineReport); report.actual_time khi đó hợp lệ bằng 0. Khi đó dùng tổng
  // giờ máy làm giờ công nhân, cùng quy tắc với giaCongMachineAccounting.js và
  // commonProcessMonthlyExcelService.js đã dùng cho Excel. Các công đoạn máy khác vẫn
  // luôn có actual_time > 0 nên fallback này không ảnh hưởng tới chúng.
  const reportedActualHours = Math.max(0, safeNumber(report.actual_time));
  const actualWorkerHours = reportedActualHours > 0 ? reportedActualHours : totalMachineHours;
  const machineDefects = aggregateMachineDefects(lines);

  return {
    performanceMode: "MACHINE",
    machine_lines: lines,
    machine_defects: machineDefects,
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

module.exports = { parseDefects, isKqdDefect, calculateMachineLinePerformance, calculateManualPerformance, calculateReportPerformance };
