'use strict';

// v3 is the canonical GC exporter. It patches/loads the real workbook template.
// This v4 wrapper works on the actual monthlyWorkbookLocal exports so it remains
// effective even though v3 itself does not expose build* functions.
const ExcelJS = require('exceljs');
require('./excelExportContractPatch.v3.cjs');
const monthly = require('./monthlyWorkbookLocal.cjs');

function asDbNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function sortedGcReports(payload) {
  const reports = Array.isArray(payload?.processes?.GC?.reports)
    ? [...payload.processes.GC.reports]
    : [];
  reports.sort((a, b) => {
    const ad = String(a?.work_date || '');
    const bd = String(b?.work_date || '');
    if (ad !== bd) return ad.localeCompare(bd);
    return String(a?.approved_at || a?.created_at || '').localeCompare(
      String(b?.approved_at || b?.created_at || '')
    );
  });
  return reports;
}

function writeDbAuthoritativeTotals(buffer, payload) {
  if (!buffer) return buffer;
  return (async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const reports = sortedGcReports(payload);
    if (!reports.length) return buffer;

    const sheet = workbook.getWorksheet('Cắt lồng') || workbook.worksheets[0];
    if (!sheet) return buffer;

    // v3 writes these two totals as formulas on every report row. Do not rely
    // on Excel/ExcelJS recalculation. Find those exact formula cells and replace
    // them, in row order, with the authoritative production_reports fields.
    const deductionCells = [];
    const ngCells = [];

    for (const row of sheet._rows || []) {
      for (const cell of row?._cells || []) {
        const formula = cell?.model?.formula;
        if (typeof formula !== 'string') continue;
        const normalized = formula.replace(/\s+/g, '').toUpperCase();
        if (/^SUM\(K\d+:Z\d+\)$/.test(normalized)) deductionCells.push(cell);
        if (/^SUM\(AJ\d+:BB\d+\)$/.test(normalized)) ngCells.push(cell);
      }
    }

    deductionCells.sort((a, b) => a.row - b.row);
    ngCells.sort((a, b) => a.row - b.row);

    const count = Math.min(reports.length, deductionCells.length, ngCells.length);
    for (let i = 0; i < count; i += 1) {
      const report = reports[i];
      deductionCells[i].value = asDbNumber(report?.deduction_time);
      ngCells[i].value = asDbNumber(report?.tt_ng);
    }

    if (count !== reports.length || deductionCells.length !== ngCells.length) {
      console.log('[KTC-EXCEL-TEMPLATE] DB_TOTAL_PATCH_COUNT', JSON.stringify({
        reports: reports.length,
        deductionCells: deductionCells.length,
        ngCells: ngCells.length,
        patched: count
      }));
    } else {
      console.log('[KTC-EXCEL-TEMPLATE] DB_TOTAL_PATCHED', JSON.stringify({
        reports: reports.length,
        patched: count
      }));
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  })();
}

async function wrapResult(result, args) {
  if (!result?.buffer) return result;
  if (String(args?.processCode || '').toUpperCase() !== 'GC') return result;
  result.buffer = await writeDbAuthoritativeTotals(result.buffer, args?.payload || {});
  return result;
}

if (typeof monthly.buildProcessWorkbookLocal === 'function') {
  const original = monthly.buildProcessWorkbookLocal;
  monthly.buildProcessWorkbookLocal = async (args = {}) => {
    const result = await original(args);
    return wrapResult(result, args);
  };
}

if (typeof monthly.buildSplitMonthlyWorkbooksLocal === 'function') {
  const original = monthly.buildSplitMonthlyWorkbooksLocal;
  monthly.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const result = await original(args);
    if (result?.processes) {
      for (const item of result.processes) {
        if (String(item?.processCode || '').toUpperCase() !== 'GC' || !item?.buffer) continue;
        item.buffer = await writeDbAuthoritativeTotals(item.buffer, args?.payload || {});
      }
    }
    return result;
  };
}

module.exports = monthly;
