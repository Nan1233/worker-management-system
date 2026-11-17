'use strict';

const { normalizeLabel } = require('./excelTemplateContractService');
const { parseJsonArray } = require('./machineAccountingJson');

function num(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function isGiaCongProcess(report) {
  return String(report.process_code || '').trim().toUpperCase() === 'GC'
    || normalizeLabel(report.process_name || '') === normalizeLabel('Gia công');
}

function compareMachineLines(left, right) {
  return num(left.sort_order) - num(right.sort_order)
    || num(left.id) - num(right.id);
}

function normalizedLineDeductions(line) {
  return parseJsonArray(line.deductions_json ?? line.deductions)
    .map((item) => ({
      deduction_type_id: Number(item?.deduction_type_id ?? item?.id) || undefined,
      deduction_code: String(item?.deduction_code ?? item?.deduction_type_code ?? item?.code ?? '').trim(),
      deduction_name: String(item?.deduction_name ?? item?.name ?? '').trim(),
      hours: Math.max(0, num(item?.hours))
    }))
    .filter((item) => item.hours > 0);
}

function exportTimesForMachineLine(line, deductions) {
  const detailHours = deductions.reduce((sum, item) => sum + item.hours, 0);
  const fallbackDeduction = Math.max(
    0,
    num(line.deduction_time_hours),
    num(line.adjustment_minutes) / 60
  );
  const deductionHours = Math.max(detailHours, fallbackDeduction);

  // Each row is a worker-machine pair. Never substitute the shared physical
  // event duration for this worker's participation time.
  const totalHours = Math.max(0, num(line.machine_time_hours));
  return {
    hasMachine: true,
    totalHours,
    actualHours: Math.max(0, totalHours - deductionHours),
    deductionHours,
    deductions
  };
}

function expandedMachineReport(report, line) {
  const deductions = normalizedLineDeductions(line);
  const ok = Math.max(0, num(line.ok_quantity));
  const ng = Math.max(0, num(line.ng_quantity));

  return {
    ...report,
    machine_no: String(line.machine_code ?? '').trim(),
    product_name: String(line.product_code ?? '').trim(),
    standard_output: Math.max(0, num(line.standard_output)),
    tt_ok: ok,
    tt_ng: ng,
    actual_output: ok + ng,
    defects: parseJsonArray(line.defects ?? line.defects_json),
    machineLines: [],
    machineAccounting: null,
    excelExportTimes: exportTimesForMachineLine(line, deductions),
    _gcMachineLineId: line.id ?? null
  };
}

function expandGiaCongMachineLines(reports) {
  const expanded = [];

  for (const report of reports || []) {
    const lines = Array.isArray(report.machineLines) ? report.machineLines.slice() : [];

    if (!isGiaCongProcess(report) || lines.length === 0) {
      // Historical reports without machine lines retain a single original row.
      expanded.push(report);
      continue;
    }

    lines.sort(compareMachineLines);
    for (const line of lines) {
      expanded.push(expandedMachineReport(report, line));
    }
  }

  return expanded;
}

module.exports = { expandGiaCongMachineLines };
