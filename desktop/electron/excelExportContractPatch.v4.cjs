'use strict';

// v3 is the canonical GC exporter. It loads the real workbook template
// `bao-cao-cat-long-export.xlsx` and renders data using that template's
// existing row/column styles. Do not copy styles from generated rows here.
const ExcelJS = require('exceljs');
const base = require('./excelExportContractPatch.v3.cjs');

const GC_STT_COL = 1;
const GC_DATE_COL = 31; // AE in the original template
const GC_DEDUCTION_TOTAL_COL = 10; // J after the launcher column normalization
const GC_NG_COL = 34; // AH

function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value ?? '').trim().slice(0, 10);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

function asDbNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function sumDbField(items, keys) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    for (const key of keys) {
      if (item?.[key] == null || item[key] === '') continue;
      return sum + asDbNumber(item[key]);
    }
    return sum;
  }, 0);
}

function dbDeductionTotal(report) {
  return sumDbField(report?.deductions, [
    'hours', 'deduction_hours', 'duration_hours', 'time_hours', 'value'
  ]);
}

function dbNgTotal(report) {
  return sumDbField(report?.defects, [
    'quantity', 'defect_quantity', 'ng_quantity', 'qty', 'count', 'value'
  ]);
}

function sortedReports(payload) {
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

// Only move the already-rendered report date from AE to A on the date row.
// All styles, fills, borders, widths, merges and conditional formatting remain
// those supplied by the original template. In particular, %TT is untouched.
async function moveReportDatesToColumnA(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Cắt lồng') || workbook.worksheets[0];
  if (!sheet) return buffer;

  for (let row = 1; row <= sheet.rowCount; row += 1) {
    const dateCell = sheet.getCell(row, GC_DATE_COL);
    const reportDate = toDate(dateCell.value);
    if (!reportDate) continue;

    // The canonical v3 renderer already creates date separator rows. We only
    // relocate the displayed date; no row/cell style is copied or normalized.
    const target = sheet.getCell(row, GC_STT_COL);
    target.value = reportDate;
    target.numFmt = 'd/m/yyyy';
    dateCell.value = null;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// Trừ H and NG are DB-authoritative fields. The detail columns are display
// columns only; these two totals must not depend on Excel/ExcelJS recalculation.
async function writeDbAuthoritativeTotals(buffer, payload) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet('Cắt lồng') || workbook.worksheets[0];
  if (!sheet) return buffer;

  const reports = sortedReports(payload);
  let rowNumber = 6;
  let currentDate = '';

  for (const report of reports) {
    const workDate = String(report?.work_date || '').slice(0, 10);
    if (workDate !== currentDate) {
      currentDate = workDate;
      rowNumber += 1; // skip the date separator row
    }

    const deductionTotal = dbDeductionTotal(report);
    const ngTotal = dbNgTotal(report);

    // Write the actual DB totals, not formulas. This makes the exported value
    // immediately correct even when Excel has not recalculated the workbook.
    sheet.getCell(rowNumber, GC_DEDUCTION_TOTAL_COL).value = deductionTotal;
    sheet.getCell(rowNumber, GC_NG_COL).value = ngTotal;

    rowNumber += 1;
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const originalProcess = base.buildProcessWorkbookLocal;
const originalSplit = base.buildSplitMonthlyWorkbooksLocal;

async function finalizeGcResult(result, args) {
  if (!result?.buffer) return result;
  if (String(args?.processCode || '').toUpperCase() !== 'GC') return result;

  result.buffer = await moveReportDatesToColumnA(result.buffer);
  result.buffer = await writeDbAuthoritativeTotals(result.buffer, args?.payload || {});
  return result;
}

if (typeof originalProcess === 'function') {
  base.buildProcessWorkbookLocal = async (args = {}) => {
    const result = await originalProcess(args);
    return finalizeGcResult(result, args);
  };
}

if (typeof originalSplit === 'function') {
  base.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const result = await originalSplit(args);
    if (result?.processes) {
      for (const item of result.processes) {
        if (String(item?.processCode || '').toUpperCase() !== 'GC' || !item?.buffer) continue;
        item.buffer = await moveReportDatesToColumnA(item.buffer);
        item.buffer = await writeDbAuthoritativeTotals(item.buffer, args?.payload || {});
      }
    }
    return result;
  };
}

module.exports = base;
