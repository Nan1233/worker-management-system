'use strict';

const { calculateMachineLinePerformance } = require('./machinePerformanceService');

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.defects)) return parsed.defects;
  } catch (_error) {
    // Legacy rows may contain malformed JSON; fall back to the saved line totals.
  }
  return [];
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const normalizeDeductions = (line) => parseArray(line.deductions ?? line.deductions_json)
  .map((item) => ({
    deduction_type_id: Number(item?.deduction_type_id ?? item?.id) || undefined,
    deduction_code: String(item?.deduction_code ?? item?.code ?? '').trim(),
    deduction_name: String(item?.deduction_name ?? item?.name ?? '').trim(),
    hours: Math.max(0, toNumber(item?.hours ?? item?.time))
  }))
  .filter((item) => item.hours > 0);

const lineOrder = (a, b) => toNumber(a.sort_order) - toNumber(b.sort_order)
  || toNumber(a.id) - toNumber(b.id);

function buildMachineExcelRows(reports) {
  return (Array.isArray(reports) ? reports : []).flatMap((report) => {
    const lines = (Array.isArray(report.machineLines) ? report.machineLines : [])
      .slice()
      .sort(lineOrder);
    if (!lines.length) return [report];

    return lines.map((line) => {
      const defects = parseArray(line.defects ?? line.defects_json);
      const deductions = normalizeDeductions(line);
      const detailHours = deductions.reduce((sum, item) => sum + item.hours, 0);
      const fallbackHours = Math.max(
        0,
        toNumber(line.deduction_time_hours),
        toNumber(line.adjustment_minutes) / 60
      );
      const deductionHours = deductions.length ? detailHours : fallbackHours;
      const machineHours = Math.max(0, toNumber(line.machine_time_hours));
      const performance = calculateMachineLinePerformance({ ...line, defects });

      // A row is the worker's saved credit for one machine line. Never copy
      // report-level aggregate output/time/defects onto each machine row.
      return {
        ...report,
        machine_no: String(line.machine_code ?? report.machine_no ?? '').trim(),
        machine_code: String(line.machine_code ?? '').trim(),
        product_name: String(line.product_code ?? report.product_name ?? '').trim(),
        product_code: String(line.product_code ?? report.product_code ?? '').trim(),
        total_time: machineHours,
        actual_time: Math.max(0, machineHours - deductionHours),
        deduction_time: deductionHours,
        standard_output: Math.max(0, toNumber(line.standard_output)),
        actual_output: performance.counted_output,
        tt_ok: performance.ok_quantity,
        tt_ng: performance.ng_quantity,
        deductions,
        defects,
        // Prevent downstream aggregate KPI objects on the parent report from
        // being repeated on every line. KPI/approval data in storage is untouched.
        machinePerformance: null,
        machineAccounting: null,
        machineLines: [line],
        excelMachineLineId: line.id ?? null
      };
    });
  });
}

module.exports = { buildMachineExcelRows, parseArray };
