'use strict';
const ExcelJS = require('exceljs');

// Final GC Excel presentation fix: keep the existing template geometry/colors,
// put the report date in column A on the separator row immediately before STT=1,
// and reapply the template row styles to every generated row.
const base = require('./excelExportContractPatch.v4.cjs');
const C = { STT: 1, DATE: 31, DEFL: 54 };

function copyStyle(src, dst) {
  if (!src || !dst) return;
  dst.font = src.font ? { ...src.font, color: src.font.color ? { ...src.font.color } : undefined } : dst.font;
  dst.fill = src.fill ? JSON.parse(JSON.stringify(src.fill)) : dst.fill;
  dst.border = src.border ? JSON.parse(JSON.stringify(src.border)) : dst.border;
  dst.alignment = src.alignment ? { ...src.alignment } : dst.alignment;
  dst.protection = src.protection ? { ...src.protection } : dst.protection;
  if (src.numFmt) dst.numFmt = src.numFmt;
}

function copyRowStyle(sheet, sourceRowNo, targetRowNo, maxCol) {
  const src = sheet.getRow(sourceRowNo);
  const dst = sheet.getRow(targetRowNo);
  dst.height = src.height;
  dst.hidden = false;
  for (let c = 1; c <= maxCol; c++) copyStyle(src.getCell(c), dst.getCell(c));
}

function clearRow(sheet, rowNo, maxCol) {
  const row = sheet.getRow(rowNo);
  for (let c = 1; c <= maxCol; c++) row.getCell(c).value = null;
}

function toDate(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = String(v ?? '').trim().slice(0, 10);
  let m = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\\d{1,2})[\\/-](\\d{1,2})[\\/-](\\d{4})$/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null;
}

async function normalizeGcBuffer(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.getWorksheet('Cắt lồng') || wb.worksheets[0];
  if (!sheet) return buffer;

  const maxCol = C.DEFL;
  const templateDateRow = 5;
  const templateDataRow = 6;

  // Find the used bottom before rebuilding styles.
  let last = templateDataRow;
  for (let r = 5; r <= sheet.rowCount; r++) {
    let used = false;
    for (let c = 1; c <= maxCol; c++) {
      const v = sheet.getCell(r, c).value;
      if (v !== null && v !== undefined && v !== '') { used = true; break; }
    }
    if (used) last = r;
  }

  // Existing v4 already rebuilds the data from DB and creates date separator rows.
  // Here we only normalize the final visual result, without inserting any rows.
  for (let r = templateDateRow; r <= last; r++) {
    const stt = sheet.getCell(r, C.STT).value;
    const isDateRow = toDate(stt) !== null;
    if (isDateRow) {
      copyRowStyle(sheet, templateDateRow, r, maxCol);
      const d = toDate(stt);
      clearRow(sheet, r, maxCol);
      sheet.getCell(r, 1).value = d;
      sheet.getCell(r, 1).numFmt = 'd/m/yyyy';
      sheet.getCell(r, 1).alignment = { ...sheet.getCell(r, 1).alignment, horizontal: 'left', vertical: 'center' };
    } else if (typeof stt === 'number' && stt >= 1) {
      copyRowStyle(sheet, templateDataRow, r, maxCol);
      // Preserve all values/formulas; only restore the template presentation.
      sheet.getCell(r, C.DATE).numFmt = 'd-mmm';
    }
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
