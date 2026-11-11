'use strict';

// Pure export-time resolution; preserve machine-accounting snapshots and
// deduplicate shared physical events in legacy machine lines.
function num(value) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function resolveReportExportTimes(report) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const mode = String(report.operation_mode || '').trim().toUpperCase();
  const hasMachine = lines.length > 0
    || mode === 'MACHINE'
    || (!mode && [report.machine_no, report.machine_code, report.machine]
      .some((value) => String(value ?? '').trim() !== ''));
  if (!hasMachine) {
    return {
      hasMachine: false,
      totalHours: Math.max(0, num(report.total_time ?? report.actual_time)),
      actualHours: Math.max(0, num(report.actual_time ?? report.total_time)),
      deductionHours: Math.max(0, num(report.deduction_time)),
      deductions: Array.isArray(report.deductions) ? report.deductions : []
    };
  }

  if (report.machineAccounting && typeof report.machineAccounting === 'object') {
    const totalHours = Math.max(0, num(report.machineAccounting.grossHours));
    const deductionHours = Math.max(0, num(report.machineAccounting.deductionHours));
    return {
      hasMachine: true,
      totalHours,
      actualHours: Math.max(0, num(report.machineAccounting.netHours)),
      deductionHours,
      deductions: Array.isArray(report.machineAccounting.deductions) ? report.machineAccounting.deductions : []
    };
  }

  let totalHours = 0;
  let deductionHours = 0;
  const seenEvents = new Set();
  const deductions = [];
  for (const [index, line] of lines.entries()) {
    const eventId = Number(line.machine_event_id) || 0;
    if (eventId && seenEvents.has(eventId)) continue;
    if (eventId) seenEvents.add(eventId);
    totalHours += Math.max(0, num(line.excel_machine_time_hours ?? line.machine_time_hours));

    const details = parseArray(line.deductions_json ?? line.deductions);
    const detailHours = details.reduce((sum, item) => sum + Math.max(0, num(item.hours)), 0);
    deductionHours += Math.max(0, detailHours, num(line.deduction_time_hours), num(line.adjustment_minutes) / 60);
    for (const item of details) {
      const hours = Math.max(0, num(item.hours));
      if (!hours) continue;
      const id = Number(item.deduction_type_id ?? item.id) || 0;
      const code = String(item.deduction_code ?? item.deduction_type_code ?? item.code ?? '').trim();
      const name = String(item.deduction_name ?? item.name ?? '').trim();
      const key = id ? 'ID:' + id : (code ? 'CODE:' + code.toUpperCase() : 'NAME:' + name.toUpperCase());
      const existing = deductions.find((entry) => entry._key === key);
      if (existing) existing.hours += hours;
      else deductions.push({
        _key: key,
        ...(id ? { deduction_type_id: id } : {}),
        deduction_code: code,
        deduction_name: name,
        hours
      });
    }
  }
  return {
    hasMachine: true,
    totalHours,
    deductionHours,
    actualHours: Math.max(0, totalHours - deductionHours),
    deductions: deductions.map(({ _key, ...item }) => item)
  };
}

module.exports = { resolveReportExportTimes };
