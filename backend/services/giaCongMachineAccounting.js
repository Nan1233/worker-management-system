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
    } else {
      grossHours += Math.max(0, Number(line.machine_time_hours) || 0);
    }

    const lineDeductionHours = Math.max(0, Number(line.deduction_time_hours) || 0, (Number(line.adjustment_minutes) || 0) / 60);
    const lineDeductions = parseJsonArray(line.deductions_json);
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

  if (deductionHours <= 0 && deductions.length === 0 && Array.isArray(report.deductions) && report.deductions.length) {
    deductionHours = report.deductions.reduce((sum, item) => sum + Math.max(0, Number(item?.hours) || 0), 0);
    deductions.push(...report.deductions.map((item) => ({ ...item })));
  }

  const legacyDeductionHours = Math.max(0, Number(report.deduction_time) || 0);
  if (deductionHours <= 0 && deductions.length === 0 && legacyDeductionHours > 0) {
    deductionHours = legacyDeductionHours;
  }

  const legacyGrossHours = Math.max(0, Number(report.total_time) || 0);
  const hasMachineLines = lines.length > 0;
  if (!hasMachineLines && grossHours <= 0 && legacyGrossHours > 0) {
    grossHours = legacyGrossHours;
    if (deductionHours <= 0 && deductions.length === 0 && legacyDeductionHours > 0) {
      deductionHours = legacyDeductionHours;
    }
  }

  let source = hasPhysicalEvent ? 'MACHINE_EVENT' : (hasMachineLines ? 'MACHINE_LINE' : 'LEGACY_REPORT');
  if (source === 'LEGACY_REPORT' && grossHours <= 0 && Number(report.actual_time) > 0) {
    grossHours = Math.max(0, Number(report.actual_time) || 0) + legacyDeductionHours;
  }

  return {
    source,
    grossHours,
    deductionHours,
    netHours: Math.max(0, grossHours - deductionHours),
    deductions
  };
};

module.exports = { buildGiaCongMachineAccounting };