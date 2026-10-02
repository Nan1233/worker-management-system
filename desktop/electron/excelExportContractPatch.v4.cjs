'use strict';

// v3 is the canonical GC exporter. It loads the real workbook template
// `bao-cao-cat-long-export.xlsx` and renders data using that template's
// existing row/column styles. Do not copy styles from generated rows here.
const ExcelJS = require('exceljs');
const base = require('./excelExportContractPatch.v3.cjs');

const GC_STT_COL = 1;
const GC_DATE_COL = 31; // AE in the original template

function toDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value ?? '').trim().slice(0, 10);
  let m = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
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

const originalProcess = base.buildProcessWorkbookLocal;
const originalSplit = base.buildSplitMonthlyWorkbooksLocal;

if (typeof originalProcess === 'function') {
  base.buildProcessWorkbookLocal = async (args = {}) => {
    const result = await originalProcess(args);
    if (String(args?.processCode || '').toUpperCase() === 'GC' && result?.buffer) {
      result.buffer = await moveReportDatesToColumnA(result.buffer);
    }
    return result;
  };
}

if (typeof originalSplit === 'function') {
  base.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const result = await originalSplit(args);
    if (result?.processes) {
      for (const item of result.processes) {
        if (String(item?.processCode || '').toUpperCase() === 'GC' && item?.buffer) {
          item.buffer = await moveReportDatesToColumnA(item.buffer);
        }
      }
    }
    return result;
  };
}

module.exports = base;
