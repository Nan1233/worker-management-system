'use strict';

const { parseJsonArray } = require('./machineAccountingJson');
const { classifyGiaCongMachineSource } = require('./giaCongMachineSource');
const { calculateMachineLineDeductionHours } = require('./giaCongMachineDeductionHours');
const { appendGiaCongMachineDeductions } = require('./giaCongMachineDeductionDetails');
const { addGiaCongPhysicalMachineHours } = require('./giaCongPhysicalMachineHours');

function hasPositiveDeduction(items) {
  return items.some((item) => Math.max(0, Number(item?.hours) || 0) > 0);
}

function hasMachineDeductionTime(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function isLegacySingleMachineReport(report, lines) {
  return lines.length === 1
    && String(report.operation_mode || '').trim().toUpperCase() === 'MACHINE';
}

function hasMissingLinkedEvent(lines, events) {
  return lines.some((line) => {
    const eventId = Number(line.machine_event_id) || 0;
    return eventId > 0 && !events.has(eventId);
  });
}

function buildGiaCongMachineAccounting(report, physicalEventsById) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const events = physicalEventsById instanceof Map ? physicalEventsById : new Map();
  const seenEvents = new Set();
  const seenDeductionKeys = new Set();
  const deductions = [];

  let grossHours = 0;
  let deductionHours = 0;
  let hasPhysicalEvent = false;

  const reportLevelDeductions = parseJsonArray(report.machineDeductions);
  const isLegacySingleMachine = isLegacySingleMachineReport(report, lines);
  const hasLineBreakdown = lines.some((line) =>
    hasPositiveDeduction(parseJsonArray(line.deductions_json))
  );

  // Worker credit details (report.deductions / deduction_time) must never
  // override physical-machine deductions. Only explicit legacy machine fields
  // may be used when a single-machine report has no line-level breakdown.
  const safeReportFallback = isLegacySingleMachine && !hasLineBreakdown
    ? reportLevelDeductions
    : [];
  const hasLegacySingleLineDeduction = isLegacySingleMachine
    && hasMachineDeductionTime(report.machineDeductionTime)
    && !hasLineBreakdown;

  lines.forEach((line, lineIndex) => {
    const physical = addGiaCongPhysicalMachineHours({
      line,
      events,
      seenEvents,
      grossHours
    });
    const eventId = physical.eventId;
    grossHours = physical.grossHours;
    if (physical.hasPhysicalEvent) hasPhysicalEvent = true;

    const storedLineDeductions = parseJsonArray(line.deductions_json);
    const lineDeductions = hasPositiveDeduction(storedLineDeductions)
      ? storedLineDeductions
      : safeReportFallback;
    const lineDeductionHours = calculateMachineLineDeductionHours({
      line,
      lineDeductions,
      legacyMachineDeductionTime: hasLegacySingleLineDeduction
        ? Math.max(0, Number(report.machineDeductionTime) || 0)
        : 0
    });

    if (lineDeductionHours <= 0) return;

    // Shared physical events contribute their hours and deductions only once.
    const deductionKey = eventId ? 'EVENT:' + eventId : 'LINE:' + (Number(line.id) || lineIndex);
    if (seenDeductionKeys.has(deductionKey)) return;

    seenDeductionKeys.add(deductionKey);
    deductionHours += lineDeductionHours;
    appendGiaCongMachineDeductions(deductions, lineDeductions);
  });

  const source = classifyGiaCongMachineSource({
    hasPhysicalEvent,
    hasMissingLinkedEvent: hasMissingLinkedEvent(lines, events),
    hasMachineLines: lines.length > 0
  });

  return {
    source,
    grossHours,
    deductionHours,
    netHours: Math.max(0, grossHours - deductionHours),
    deductions
  };
}

module.exports = { buildGiaCongMachineAccounting };
