'use strict';

const number = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return 0;
  const result = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(result) ? result : 0;
};

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const machineLinesOf = (report) => {
  if (Array.isArray(report?.machineLines)) return report.machineLines;
  if (Array.isArray(report?.machine_lines)) return report.machine_lines;
  if (Array.isArray(report?.machines)) return report.machines;
  return [];
};

const hasMachineOf = (report, lines) => {
  const mode = String(report?.operation_mode || '').trim().toUpperCase();
  return lines.length > 0
    || mode === 'MACHINE'
    || (!mode && [report?.machine_no, report?.machine_code, report?.machine]
      .some((value) => String(value ?? '').trim() !== ''));
};

function addDeduction(target, item) {
  const hours = Math.max(0, number(item?.hours ?? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours));
  if (!hours) return;
  const id = Number(item?.deduction_type_id ?? item?.id) || 0;
  const code = String(item?.deduction_code ?? item?.deduction_type_code ?? item?.code ?? '').trim();
  const name = String(item?.deduction_name ?? item?.deduction_type_name ?? item?.name ?? '').trim();
  const key = id ? 'ID:' + id : (code ? 'CODE:' + code.toUpperCase() : 'NAME:' + name.toUpperCase());
  const existing = target.find((entry) => entry._key === key);
  if (existing) existing.hours += hours;
  else target.push({
    _key: key,
    ...(id ? { deduction_type_id: id } : {}),
    deduction_code: code,
    deduction_name: name,
    hours
  });
}

function resolveExportTimes(report = {}) {
  const lines = machineLinesOf(report);
  const hasMachine = hasMachineOf(report, lines);
  if (!hasMachine) {
    return {
      hasMachine: false,
      source: 'WORKER_REPORT',
      totalHours: Math.max(0, number(report.total_time ?? report.actual_time)),
      actualHours: Math.max(0, number(report.actual_time ?? report.total_time)),
      deductionHours: Math.max(0, number(report.deduction_time)),
      deductions: Array.isArray(report.deductions) ? report.deductions : []
    };
  }

  const accounting = report.machineAccounting;
  if (accounting && typeof accounting === 'object') {
    const totalHours = Math.max(0, number(accounting.grossHours));
    const deductionHours = Math.max(0, number(accounting.deductionHours));
    return {
      hasMachine: true,
      source: String(accounting.source || 'MACHINE_ACCOUNTING'),
      totalHours,
      deductionHours,
      actualHours: Math.max(0, number(accounting.netHours ?? (totalHours - deductionHours))),
      deductions: Array.isArray(accounting.deductions) ? accounting.deductions : []
    };
  }

  const events = new Map();
  for (const event of [
    ...(Array.isArray(report.eventLines) ? report.eventLines : []),
    ...(Array.isArray(report.physicalMachineEvents) ? report.physicalMachineEvents : [])
  ]) {
    const id = Number(event?.id);
    if (id > 0 && !events.has(id)) events.set(id, event);
  }

  let totalHours = 0;
  let deductionHours = 0;
  const seenEvents = new Set();
  const machineDeductions = [];
  for (const [index, line] of lines.entries()) {
    const eventId = Number(line?.machine_event_id) || 0;
    if (eventId && seenEvents.has(eventId)) continue;
    if (eventId) seenEvents.add(eventId);

    const event = eventId ? events.get(eventId) : null;
    const lineHours = event
      ? number(event.machine_time_hours)
      : number(line?.excel_machine_time_hours ?? line?.machine_time_hours ?? line?.machineTimeHours);
    totalHours += Math.max(0, lineHours);

    const detailRows = parseArray(line?.deductions_json ?? line?.deductions);
    const detailHours = detailRows.reduce((sum, item) => sum + Math.max(0, number(item?.hours)), 0);
    const lineDeduction = Math.max(
      detailHours,
      number(line?.deduction_time_hours),
      number(line?.adjustment_minutes) / 60
    );
    deductionHours += Math.max(0, lineDeduction);
    for (const item of detailRows) addDeduction(machineDeductions, item);

    // Legacy lines may store a total deduction without a typed breakdown.
    if (!detailRows.length && lineDeduction > 0) {
      machineDeductions.push({
        _key: 'UNMAPPED:' + (eventId ? 'EVENT:' + eventId : 'LINE:' + (Number(line?.id) || index)),
        deduction_name: '',
        deduction_code: '',
        hours: lineDeduction
      });
    }
  }

  // If there are no machine details, do not silently substitute worker time.
  // Missing physical machine time remains zero and can be reviewed/backfilled.
  if (!lines.length) {
    totalHours = Math.max(0, number(report.machine_time_hours));
    deductionHours = Math.max(0, number(report.machine_deduction_time_hours));
  }

  return {
    hasMachine: true,
    source: lines.length ? 'MACHINE_LINES' : 'MACHINE_TIME_MISSING',
    totalHours,
    deductionHours,
    actualHours: Math.max(0, totalHours - deductionHours),
    deductions: machineDeductions.filter((item) => !String(item._key || '').startsWith('UNMAPPED:')).map(({ _key, ...item }) => item)
  };
}

module.exports = { resolveExportTimes, machineLinesOf, parseArray };
