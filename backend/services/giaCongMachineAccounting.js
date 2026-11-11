const { parseJsonArray } = require("./machineAccountingJson");
const { classifyGiaCongMachineSource } = require("./giaCongMachineSource");
const { calculateMachineLineDeductionHours } = require("./giaCongMachineDeductionHours");
const { appendGiaCongMachineDeductions } = require("./giaCongMachineDeductionDetails");

const buildGiaCongMachineAccounting = (report, physicalEventsById) => {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const events = physicalEventsById instanceof Map ? physicalEventsById : new Map();
  const seenEvents = new Set();
  let grossHours = 0;
  let hasPhysicalEvent = false;
  let deductionHours = 0;
  const deductions = [];
  const seenDeductionKeys = new Set();
  const reportLevelDeductions = parseJsonArray(report.machineDeductions);
  const isLegacySingleMachineReport = lines.length === 1
    && String(report.operation_mode || '').trim().toUpperCase() === 'MACHINE';
  const hasLineBreakdown = lines.some((line) => parseJsonArray(line.deductions_json)
    .some((item) => Math.max(0, Number(item?.hours) || 0) > 0));
  // Only explicitly named machine-level fields may be used as a legacy
  // fallback. report.deductions and report.deduction_time belong to Worker
  // credit and must never be projected onto physical machine time.
  const safeReportFallback = isLegacySingleMachineReport && !hasLineBreakdown
    ? reportLevelDeductions
    : [];
  const hasLegacySingleLineDeduction = isLegacySingleMachineReport
    && report.machineDeductionTime !== null
    && report.machineDeductionTime !== undefined
    && String(report.machineDeductionTime).trim() !== ''
    && !hasLineBreakdown;

  lines.forEach((line, lineIndex) => {
    const eventId = Number(line.machine_event_id) || 0;
    const event = eventId ? events.get(eventId) : null;
    if (event) {
      hasPhysicalEvent = true;
      if (!seenEvents.has(eventId)) {
        seenEvents.add(eventId);
        grossHours += Math.max(0, Number(event.machine_time_hours) || 0);
      }
    } else if (!eventId) {
      grossHours += Math.max(0, Number(line.excel_machine_time_hours ?? line.machine_time_hours) || 0);
    }

    const storedLineDeductions = parseJsonArray(line.deductions_json);
    const hasPositiveStoredDeduction = storedLineDeductions.some(
      (item) => Math.max(0, Number(item?.hours) || 0) > 0
    );
    const lineDeductions = hasPositiveStoredDeduction ? storedLineDeductions : safeReportFallback;
    const lineDeductionHours = calculateMachineLineDeductionHours({
      line,
      lineDeductions,
      legacyMachineDeductionTime: hasLegacySingleLineDeduction
        ? Math.max(0, Number(report.machineDeductionTime) || 0)
        : 0
    });
    if (lineDeductionHours > 0) {
      const deductionKey = eventId ? 'EVENT:' + eventId : 'LINE:' + (Number(line.id) || lineIndex);
      if (!seenDeductionKeys.has(deductionKey)) {
        seenDeductionKeys.add(deductionKey);
        deductionHours += lineDeductionHours;
        appendGiaCongMachineDeductions(deductions, lineDeductions);
      }
    }
  });

  const hasMachineLines = lines.length > 0;
  const hasMissingLinkedEvent = lines.some((line) => {
    const eventId = Number(line.machine_event_id) || 0;
    return eventId > 0 && !events.has(eventId);
  });
  const source = classifyGiaCongMachineSource({ hasPhysicalEvent, hasMissingLinkedEvent, hasMachineLines });

  return {
    source,
    grossHours,
    deductionHours,
    netHours: Math.max(0, grossHours - deductionHours),
    deductions
  };
};

module.exports = { buildGiaCongMachineAccounting };