'use strict';
const ExcelJS = require('exceljs');

// Final GC presentation pass.
// IMPORTANT: v3 already renders every data row from the real GC template.
// Do NOT copy row 6/8 styles over generated rows here: that was causing the
// exported workbook to lose the template's original colors/layout and could
// interfere with the %TT conditional-formatting behavior.
const base = require('./excelExportContractPatch.v4.cjs');
const C = { STT: 1, DATE: 31, MAX: 54 };

function toDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = String(v ?? '').trim().slice(0, 10);
  let m = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})$/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

function moveDateToColumnA(sheet, rowNo) {
  const dateCell = sheet.getCell(rowNo, C.DATE);
  const d = toDate(dateCell.value);
  if (!d) return;

  // Keep the entire row exactly as produced by the original GC template.
  // Only move the report date to column A as requested.
  const target = sheet.getCell(rowNo, C.STT);
  target.value = d;
  target.numFmt = 'd/m/yyyy';
  target.alignment = {
    ...(target.alignment || {}),
    horizontal: 'left',
    vertical: 'center'
  };
  dateCell.value = null;
}

async function normalizeGcBuffer(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet('Cắt lồng') || wb.worksheets[0];
  if (!sheet) return buffer;

  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const stt = sheet.getCell(r, C.STT).value;
    if (toDate(stt)) continue;
    const dateValue = sheet.getCell(r, C.DATE).value;
    if (toDate(dateValue)) moveDateToColumnA(sheet, r);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const originalProcess = base.buildProcessWorkbookLocal;
const originalSplit = base.buildSplitMonthlyWorkbooksLocal;

if (typeof originalProcess === 'function') {
  base.buildProcessWorkbookLocal = async (args = {}) => {
    const result = await originalProcess(args);
    if (String(args.processCode || '').toUpperCase() === 'GC' && result?.buffer) {
      result.buffer = await normalizeGcBuffer(result.buffer);
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
          item.buffer = await normalizeGcBuffer(item.buffer);
        }
      }
    }
    return result;
  };
}

module.exports = base;
