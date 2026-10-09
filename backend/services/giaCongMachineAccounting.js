const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
};

const buildGiaCongMachineAccounting = (report, physicalEventsById) => {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const events = physicalEventsById instanceof Map ? physicalEventsById : new Map();
  const seenEvents = new Set();
  let grossHours = 0;
  let hasPhysicalEvent = false;
  let deductionHours = 0;
  const deductions = [];
  const seenDeductionKeys = new Set();

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

    const lineDeductions = parseJsonArray(line.deductions_json);
    const detailDeductionHours = lineDeductions.reduce((sum, item) => sum + Math.max(0, Number(item?.hours) || 0), 0);
    const lineDeductionHours = Math.max(
      0,
      Number(line.deduction_time_hours) || 0,
      (Number(line.adjustment_minutes) || 0) / 60,
      detailDeductionHours
    );
    if (lineDeductionHours > 0 || lineDeductions.length) {
      const deductionKey = eventId ? 'EVENT:' + eventId : 'LINE:' + (Number(line.id) || lineIndex);
      if (!seenDeductionKeys.has(deductionKey)) {
        seenDeductionKeys.add(deductionKey);
        deductionHours += lineDeductionHours;
        for (const item of lineDeductions) {
          const key = Number(item?.deduction_type_id) || String(item?.deduction_code || item?.deduction_name || '');
          const existing = deductions.find((entry) => String(entry.deduction_type_id || entry.deduction_code || entry.deduction_name) === String(key));
          const hours = Math.max(0, Number(item?.hours) || 0);
          if (!hours) continue;
          if (existing) existing.hours += hours;
          else deductions.push({
            deduction_type_id: Number(item?.deduction_type_id) || undefined,
            deduction_code: String(item?.deduction_code || '').trim(),
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