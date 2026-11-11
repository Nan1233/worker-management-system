'use strict';

const { normalizeLabel } = require('./excelTemplateContractService');
function alias(value) { return normalizeLabel(value); }
function num(value) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

function expandGiaCongMachineLines(reports) {
  const expanded = [];
  for (const report of reports || []) {
    const isGiaCong = String(report.process_code || '').trim().toUpperCase() === 'GC'
      || alias(report.process_name || '') === alias('Gia công');
    const lines = Array.isArray(report.machineLines) ? report.machineLines.slice() : [];
    if (!isGiaCong || !lines.length) {
      // Historical reports without machineLines retain one row; never fabricate a machine.
      expanded.push(report);
      continue;
    }
    lines.sort((a, b) => num(a.sort_order) - num(b.sort_order) || num(a.id) - num(b.id));
    for (const line of lines) {
      const deductions = parseArray(line.deductions_json ?? line.deductions).map((item) => ({
        deduction_type_id: Number(item?.deduction_type_id ?? item?.id) || undefined,
        deduction_code: String(item?.deduction_code ?? item?.deduction_type_code ?? item?.code ?? '').trim(),
        deduction_name: String(item?.deduction_name ?? item?.name ?? '').trim(),
        hours: Math.max(0, num(item?.hours))
      })).filter((item) => item.hours > 0);
      const detailHours = deductions.reduce((sum, item) => sum + item.hours, 0);
      const fallbackDeduction = Math.max(0, num(line.deduction_time_hours), num(line.adjustment_minutes) / 60);
      const deductionHours = Math.max(detailHours, fallbackDeduction);
      // This sheet expands worker-machine pairs: show worker participation
      // time, not the shared physical event duration repeated on each worker.
      const totalHours = Math.max(0, num(line.machine_time_hours));
      const actualHours = Math.max(0, totalHours - deductionHours);
      const ok = Math.max(0, num(line.ok_quantity));
      const ng = Math.max(0, num(line.ng_quantity));
      expanded.push({
        ...report,
        machine_no: String(line.machine_code ?? '').trim(),
        product_name: String(line.product_code ?? '').trim(),
        standard_output: Math.max(0, num(line.standard_output)),
        tt_ok: ok,
        tt_ng: ng,
        actual_output: ok + ng,
        defects: parseArray(line.defects ?? line.defects_json),
        machineLines: [],
        machineAccounting: null,
        excelExportTimes: { hasMachine: true, totalHours, actualHours, deductionHours, deductions },
        _gcMachineLineId: line.id ?? null
      });
    }
  }
  return expanded;
}

module.exports = { expandGiaCongMachineLines };
