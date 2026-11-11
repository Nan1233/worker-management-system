const { parseJsonArray } = require("./machineAccountingJson");

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
    const detailDeductionHours = lineDeductions.reduce((sum, item) => sum + Math.max(0, Number(item?.hours) || 0), 0);
    const lineDeductionHours = Math.max(
      0,
      Number(line.deduction_time_hours) || 0,
      (Number(line.adjustment_minutes) || 0) / 60,
      detailDeductionHours,
      hasLegacySingleLineDeduction ? Math.max(0, Number(report.machineDeductionTime) || 0) : 0
    );
    if (lineDeductionHours > 0) {
      const deductionKey = eventId ? 'EVENT:' + eventId : 'LINE:' + (Number(line.id) || lineIndex);
      if (!seenDeductionKeys.has(deductionKey)) {
        seenDeductionKeys.add(deductionKey);
        deductionHours += lineDeductionHours;
        for (const item of lineDeductions) {
          const key = Number(item?.deduction_type_id) || String(item?.deduction_code || item?.deduction_type_code || item?.deduction_name || '');
          const existing = deductions.find((entry) => String(entry.deduction_type_id || entry.deduction_code || entry.deduction_name) === String(key));
          const hours = Math.max(0, Number(item?.hours) || 0);
          if (!hours) continue;
          if (existing) existing.hours += hours;
          else deductions.push({
            deduction_type_id: Number(item?.deduction_type_id) || undefined,
            deduction_code: String(item?.deduction_code || item?.deduction_type_code || '').trim(),
            deduction_name: String(item?.deduction_name || '').trim(),
            hours
          });
        }
      }
    }
  });

  const hasMachineLines = lines.length > 0;
  const hasMissingLinkedEvent = lines.some((line) => {
    const eventId = Number(line.machine_event_id) || 0;
    return eventId > 0 && !events.has(eventId);
  });
  const source = hasPhysicalEvent
    ? (hasMissingLinkedEvent ? 'MACHINE_EVENT_PARTIAL' : 'MACHINE_EVENT')
    : (hasMissingLinkedEvent ? 'MACHINE_EVENT_MISSING' : (hasMachineLines ? 'MACHINE_LINE' : 'MACHINE_DATA_MISSING'));

  return {
    source,
    grossHours,
    deductionHours,
    netHours: Math.max(0, grossHours - deductionHours),
    deductions
  };
};

module.exports = { buildGiaCongMachineAccounting };