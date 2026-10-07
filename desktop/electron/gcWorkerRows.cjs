'use strict';

// Row model for Gia công (GC) Excel export: ONE MACHINE LINE = ONE EXCEL ROW.
// Mirrors backend/services/gcWorkerReportRows.js (04_CAT_LONG source of truth);
// the desktop package cannot require backend/, so keep both in sync.
// Reports without machine lines (manual work) produce a single row.

const toNumber = (value) => {
  const number = Number(String(value ?? 0).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : 0;
};
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const has = (value) => value !== null && value !== undefined && String(value).trim() !== '';

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.defects)) return parsed.defects;
    return [];
  } catch (_error) {
    return [];
  }
};

const normalizeDeductions = (items) => parseArray(items)
  .map((item) => ({
    deduction_type_id: Number(item?.deduction_type_id ?? item?.id) || undefined,
    deduction_code: String(item?.deduction_code ?? item?.code ?? '').trim(),
    deduction_name: String(item?.deduction_name ?? item?.name ?? '').trim(),
    hours: Math.max(0, toNumber(item?.hours))
  }))
  .filter((item) => item.hours > 0);

const normalizeDefects = (items) => parseArray(items)
  .map((item) => ({
    defect_type_id: Number(item?.defect_type_id ?? item?.id) || undefined,
    defect_code: String(item?.defect_code ?? item?.code ?? '').trim(),
    defect_name: String(item?.defect_name ?? item?.name ?? '').trim(),
    quantity: Math.max(0, toNumber(item?.quantity))
  }))
  .filter((item) => item.quantity > 0);

const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);

function machineLineRow(report, line) {
  const deductions = normalizeDeductions(line.deductions_json ?? line.deductions);
  const itemHours = sum(deductions, 'hours');
  const fallbackHours = Math.max(toNumber(line.deduction_time_hours), toNumber(line.adjustment_minutes) / 60);
  const deductionHours = deductions.length ? itemHours : fallbackHours;
  const machineHours = Math.max(0, toNumber(line.machine_time_hours));
  const ok = Math.max(0, Math.round(toNumber(line.ok_quantity)));
  const ng = Math.max(0, Math.round(toNumber(line.ng_quantity)));
  return {
    source: 'MACHINE_LINE',
    machine: String(line.machine_code ?? line.machine_no ?? line.code ?? '').trim(),
    product: String(line.product_code ?? '').trim(),
    standardPerHour: has(line.standard_output) ? toNumber(line.standard_output) : null,
    totalHours: round2(machineHours),
    workedHours: round2(Math.max(0, machineHours - deductionHours)),
    deductionHours: round2(deductionHours),
    ok, ng,
    deductions,
    defects: normalizeDefects(line.defects ?? line.defects_json)
  };
}

function manualRow(report) {
  const deductions = normalizeDeductions(report.deductions);
  const itemHours = sum(deductions, 'hours');
  const deductionHours = deductions.length ? itemHours : toNumber(report.deduction_time);
  const workedHours = Math.max(0, has(report.actual_time) ? toNumber(report.actual_time) : toNumber(report.total_time) - deductionHours);
  return {
    source: 'MANUAL',
    machine: '',
    product: '',
    standardPerHour: null,
    totalHours: round2(workedHours + deductionHours),
    workedHours: round2(workedHours),
    deductionHours: round2(deductionHours),
    ok: Math.max(0, Math.round(toNumber(report.tt_ok ?? report.ok_quantity ?? report.ok))),
    ng: Math.max(0, Math.round(toNumber(report.tt_ng))),
    deductions,
    defects: normalizeDefects(report.defects)
  };
}

const lineOrder = (a, b) => toNumber(a.sort_order) - toNumber(b.sort_order) || toNumber(a.id) - toNumber(b.id);

function getReportMachineLines(report) {
  for (const key of ['machineLines', 'machine_lines', 'machine_details', 'machines']) {
    if (Array.isArray(report?.[key]) && report[key].length) return report[key];
  }
  return [];
}

/**
 * Expand one GC report into per-row "synthetic reports" the company-sheet row
 * writer understands: each carries only its own line's time, deductions, output
 * and defects, so nothing is duplicated across rows.
 */
function expandGcReportRows(report) {
  const lines = getReportMachineLines(report).slice().sort(lineOrder);
  if (!lines.length) return [report];
  return lines.map((line) => {
    const row = machineLineRow(report, line);
    const expanded = { ...report };
    delete expanded.machineLines; delete expanded.machine_lines; delete expanded.machine_details; delete expanded.machines;
    delete expanded.machineAccounting; delete expanded.eventLines;
    return Object.assign(expanded, {
      operation_mode: 'MACHINE_LINE_ROW',
      machine_no: row.machine,
      machine_code: row.machine,
      product_code: row.product,
      product_name: row.product,
      standard_output: row.standardPerHour ?? report.standard_output,
      total_time: row.totalHours,
      actual_time: row.workedHours,
      deduction_time: row.deductionHours,
      gc_row_deduction_hours: row.deductionHours,
      deductions: row.deductions,
      defects: row.defects,
      tt_ok: row.ok,
      tt_ng: row.ng,
      actual_output: row.ok + row.ng
    });
  });
}

module.exports = { expandGcReportRows, getReportMachineLines };
