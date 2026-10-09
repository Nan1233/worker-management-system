'use strict';

// Pure row model for the Gia công "Báo cáo công nhân" sheet (04_CAT_LONG layout).
//
// One Excel row per machine line; reports without machine lines (manual work)
// produce one row. Nothing here reads report-level totals to fill machine rows:
// time, deductions, output and defects always come from that line itself.

const { trainingFactor } = require('../utils/trainingPercent');

const toNumber = (value) => {
  const number = Number(String(value ?? 0).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : 0;
};
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

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

const baseOf = (report) => ({
  reportId: report.id,
  workerCode: report.worker_code ?? '',
  workerName: report.full_name || report.worker_name || '',
  shift: report.shift || ''
});

function machineLineRow(report, line) {
  const deductions = normalizeDeductions(line.deductions_json);
  const warnings = [];
  const itemHours = sum(deductions, 'hours');
  const fallbackHours = Math.max(toNumber(line.deduction_time_hours), toNumber(line.adjustment_minutes) / 60);
  // The per-type breakdown is the source of H:W. Hours that exist only as an
  // unexplained total are still deducted (F + G keeps adding up) but are reported.
  const deductionHours = deductions.length ? itemHours : fallbackHours;
  if (deductions.length && fallbackHours - itemHours > 0.01) warnings.push('DEDUCTION_TOTAL_EXCEEDS_BREAKDOWN');
  if (!deductions.length && fallbackHours > 0) warnings.push('DEDUCTION_WITHOUT_BREAKDOWN');

  const hasPhysicalEvent = Number(line.machine_event_id) > 0;
  const machineHours = Math.max(0, toNumber(line.excel_machine_time_hours ?? line.machine_time_hours));
  if (hasPhysicalEvent && machineHours <= 0) warnings.push('PHYSICAL_MACHINE_EVENT_TIME_MISSING');
  const workedHours = Math.max(0, machineHours - deductionHours);
  const ok = Math.max(0, Math.round(toNumber(line.ok_quantity)));
  const ng = Math.max(0, Math.round(toNumber(line.ng_quantity)));
  const defects = normalizeDefects(line.defects ?? line.defects_json);
  if (ng > 0 && sum(defects, 'quantity') !== ng) warnings.push('DEFECT_TOTAL_DIFFERS_FROM_NG');

  return {
    ...baseOf(report),
    source: 'MACHINE_LINE',
    machine: String(line.machine_code ?? '').trim(),
    product: String(line.product_code ?? '').trim(),
    totalHours: round2(machineHours),
    workedHours: round2(workedHours),
    deductionHours: round2(deductionHours),
    standard: Math.round(Math.max(0, toNumber(line.standard_output)) * workedHours * trainingFactor(report.training_percent)),
    ok, ng, tt: ok + ng,
    deductions, defects, warnings
  };
}

function manualRow(report) {
  const deductions = normalizeDeductions(report.deductions);
  const warnings = [];
  const itemHours = sum(deductions, 'hours');
  const totalDeduction = toNumber(report.deduction_time);
  const deductionHours = deductions.length ? itemHours : totalDeduction;
  if (!deductions.length && totalDeduction > 0) warnings.push('DEDUCTION_WITHOUT_BREAKDOWN');
  const totalHours = Math.max(0, toNumber(report.total_time));
  const hasActual = report.actual_time !== null && report.actual_time !== undefined && String(report.actual_time).trim() !== '';
  const workedHours = Math.max(0, hasActual ? toNumber(report.actual_time) : totalHours - deductionHours);
  const ok = Math.max(0, Math.round(toNumber(report.tt_ok)));
  const ng = Math.max(0, Math.round(toNumber(report.tt_ng)));
  const defects = normalizeDefects(report.defects);
  if (ng > 0 && sum(defects, 'quantity') !== ng) warnings.push('DEFECT_TOTAL_DIFFERS_FROM_NG');
  return {
    ...baseOf(report),
    source: 'MANUAL',
    machine: String(report.machine_no ?? '').trim(),
    product: String(report.product_name ?? '').trim(),
    totalHours: round2(totalHours),
    workedHours: round2(workedHours),
    deductionHours: round2(deductionHours),
    standard: Math.round(Math.max(0, toNumber(report.standard_output)) * workedHours * trainingFactor(report.training_percent)),
    ok, ng, tt: ok + ng,
    deductions, defects, warnings
  };
}

const lineOrder = (a, b) => toNumber(a.sort_order) - toNumber(b.sort_order) || toNumber(a.id) - toNumber(b.id);

function missingMachineRow(report) {
  const row = manualRow(report);
  return {
    ...row,
    source: 'MACHINE_DATA_MISSING',
    totalHours: 0,
    workedHours: 0,
    deductionHours: 0,
    standard: 0,
    deductions: [],
    warnings: [...row.warnings, 'MACHINE_TIME_UNAVAILABLE_NO_MACHINE_LINES']
  };
}

/** All Excel rows of one approved GC report, in line order. */
function buildGcWorkerRows(report) {
  const lines = (Array.isArray(report.machineLines) ? report.machineLines : []).slice().sort(lineOrder);
  if (lines.length) return lines.map((line) => machineLineRow(report, line));
  const mode = String(report.operation_mode || '').trim().toUpperCase();
  const hasMachine = mode === 'MACHINE'
    || (!mode && [report.machine_no, report.machine_code, report.machine]
      .some((value) => String(value ?? '').trim() !== ''));
  return [hasMachine ? missingMachineRow(report) : manualRow(report)];
}

module.exports = { buildGcWorkerRows, parseArray, round2 };
