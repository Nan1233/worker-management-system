'use strict';

// Pure export-time resolution. Persisted machine snapshots take precedence;
// legacy machine lines must count shared physical events only once.
const { parseJsonArray } = require('./machineAccountingJson');

function num(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function positiveHours(value) {
  return Math.max(0, num(value));
}

function hasMachineReference(report, lines) {
  const mode = String(report.operation_mode || '').trim().toUpperCase();
  return lines.length > 0
    || mode === 'MACHINE'
    || (!mode && [report.machine_no, report.machine_code, report.machine]
      .some((value) => String(value ?? '').trim() !== ''));
}

function workerExportTimes(report) {
  return {
    hasMachine: false,
    totalHours: positiveHours(report.total_time ?? report.actual_time),
    actualHours: positiveHours(report.actual_time ?? report.total_time),
    deductionHours: positiveHours(report.deduction_time),
    deductions: Array.isArray(report.deductions) ? report.deductions : []
  };
}

function snapshotExportTimes(machineAccounting) {
  return {
    hasMachine: true,
    totalHours: positiveHours(machineAccounting.grossHours),
    actualHours: positiveHours(machineAccounting.netHours),
    deductionHours: positiveHours(machineAccounting.deductionHours),
    deductions: Array.isArray(machineAccounting.deductions) ? machineAccounting.deductions : []
  };
}

function deductionIdentity(item) {
  const id = Number(item.deduction_type_id ?? item.id) || 0;
  const code = String(item.deduction_code ?? item.deduction_type_code ?? item.code ?? '').trim();
  const name = String(item.deduction_name ?? item.name ?? '').trim();
  const key = id
    ? 'ID:' + id
    : (code ? 'CODE:' + code.toUpperCase() : 'NAME:' + name.toUpperCase());
  return { id, code, name, key };
}

function appendDeduction(deductions, item) {
  const hours = positiveHours(item.hours);
  if (!hours) return;

  const { id, code, name, key } = deductionIdentity(item);
  const existing = deductions.find((entry) => entry._key === key);
  if (existing) {
    existing.hours += hours;
    return;
  }

  deductions.push({
    _key: key,
    ...(id ? { deduction_type_id: id } : {}),
    deduction_code: code,
    deduction_name: name,
    hours
  });
}

function lineDeductionHours(line, details) {
  const detailsTotal = details.reduce((total, item) => total + positiveHours(item.hours), 0);
  return Math.max(
    0,
    detailsTotal,
    num(line.deduction_time_hours),
    num(line.adjustment_minutes) / 60
  );
}

function legacyMachineExportTimes(lines) {
  let totalHours = 0;
  let deductionHours = 0;
  const seenEvents = new Set();
  const deductions = [];

  for (const line of lines) {
    const eventId = Number(line.machine_event_id) || 0;
    if (eventId && seenEvents.has(eventId)) continue;
    if (eventId) seenEvents.add(eventId);

    totalHours += positiveHours(line.excel_machine_time_hours ?? line.machine_time_hours);
    const details = parseJsonArray(line.deductions_json ?? line.deductions);
    deductionHours += lineDeductionHours(line, details);
    for (const item of details) appendDeduction(deductions, item);
  }

  return {
    hasMachine: true,
    totalHours,
    deductionHours,
    actualHours: Math.max(0, totalHours - deductionHours),
    deductions: deductions.map(({ _key, ...item }) => item)
  };
}

function resolveReportExportTimes(report) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  if (!hasMachineReference(report, lines)) return workerExportTimes(report);

  if (report.machineAccounting && typeof report.machineAccounting === 'object') {
    return snapshotExportTimes(report.machineAccounting);
  }
  return legacyMachineExportTimes(lines);
}

module.exports = { resolveReportExportTimes };
