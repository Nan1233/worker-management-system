'use strict';

const LAST_COLUMN = 53;
const MAX_DEDUCTIONS = 15;
const MAX_DEFECTS = 16;
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }

function clearSheetData(sheet) {
  // ExcelJS has no `sheet.mergedCells`: the old `[...(sheet.mergedCells || [])]` was always empty, so no
  // template merge was ever removed and the first writeDateRow() -> mergeCells() on a merged template row
  // threw "Cannot merge already merged cells" as soon as the (previously hung) clear loop finished.
  // The merge registry is `sheet._merges` ({masterAddress: Range}); it is the same data ExcelJS serialises.
  for (const merge of Object.values(sheet._merges || {})) { try { sheet.unMergeCells(merge.range); } catch (_) {} }
  // Only visit cells that exist in the template. The previous nested loop used
  // `c <= sheet.columnCount` as its condition: ExcelJS recomputes columnCount by scanning EVERY row on
  // each access, and getRow()/getCell() materialise a cell at every (row, column) position, so a
  // template whose used range is ~1M cells made the export O(n^2) and pinned the CPU at 100 % for
  // minutes (POST /api/reports/export-excel never answered). Styles are kept; only values are cleared.
  sheet.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => { cell.value = null; });
  });
  if (Array.isArray(sheet.conditionalFormattings)) sheet.conditionalFormattings.length = 0;
  const columnCount = sheet.columnCount; // read once: see above
  for (let c = LAST_COLUMN + 1; c <= columnCount; c += 1) sheet.getColumn(c).hidden = true;
}

function captureRowStyles(sheet, rowNumber) {
  const result = [];
  const row = sheet.getRow(rowNumber);
  for (let c = 1; c <= LAST_COLUMN; c += 1) {
    const cell = row.getCell(c);
    result.push({ style: clone(cell.style), font: clone(cell.font), fill: clone(cell.fill), border: clone(cell.border), alignment: clone(cell.alignment), protection: clone(cell.protection), numFmt: cell.numFmt });
  }
  return result;
}
function applyStyle(cell, source) {
  if (!source) return;
  if (source.style) cell.style = clone(source.style);
  if (source.font) cell.font = clone(source.font);
  if (source.fill) cell.fill = clone(source.fill);
  if (source.border) cell.border = clone(source.border);
  if (source.alignment) cell.alignment = clone(source.alignment);
  if (source.protection) cell.protection = clone(source.protection);
  if (source.numFmt) cell.numFmt = source.numFmt;
}
function copyTemplateStyles(sheet, sourceRow, targetRow, styles) {
  const row = sheet.getRow(targetRow); row.height = sheet.getRow(sourceRow).height || 18;
  for (let c = 1; c <= LAST_COLUMN; c += 1) applyStyle(row.getCell(c), styles[c - 1]);
}
function setHeader(sheet, rowNumber, styles, deductions, defects) {
  copyTemplateStyles(sheet, 3, rowNumber, styles);
  const headers = [
    'STT', 'Mã CN', 'Họ tên', 'Số máy', 'Ca', '% học việc', 'Tổng thời gian', 'Thời gian thực tế', 'Số lần CM', 'Tổng TG trừ giờ', 'Thiếu sản lượng',
    ...Array.from({ length: MAX_DEDUCTIONS }, (_, i) => deductions[i]?.name || ''),
    'SP', 'Định mức', 'TT', '% định mức', 'Ngày', 'Định mức/h', 'OK', 'Tổng NG', '% NG',
    ...Array.from({ length: MAX_DEFECTS }, (_, i) => defects[i]?.name || ''), 'OK', 'NG'
  ];
  headers.forEach((value, index) => {
    const cell = sheet.getRow(rowNumber).getCell(index + 1);
    cell.value = value; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.font = { ...(cell.font || {}), bold: true };
  });
  sheet.getRow(rowNumber).height = 44;
}
function writeDateRow(sheet, rowNumber, text, style) {
  const row = sheet.getRow(rowNumber); row.height = 25;
  for (let c = 1; c <= LAST_COLUMN; c += 1) applyStyle(row.getCell(c), style[c - 1]);
  sheet.mergeCells(rowNumber, 1, rowNumber, LAST_COLUMN);
  const cell = row.getCell(1); cell.value = text;
  cell.font = { ...(cell.font || {}), bold: true, size: Math.max(11, Number(cell.font?.size || 10) + 1) };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
}

function prepareSheet(sheet) {
  const headerStyles = captureRowStyles(sheet, 3), dataStyles = captureRowStyles(sheet, Math.min(6, sheet.rowCount)), dateStyles = captureRowStyles(sheet, 1);
  const widths = Array.from({ length: LAST_COLUMN }, (_, i) => sheet.getColumn(i + 1).width);
  clearSheetData(sheet); widths.forEach((width, i) => { if (width != null) sheet.getColumn(i + 1).width = width; });
  return { headerStyles, dataStyles, dateStyles };
}

module.exports = { clearSheetData, captureRowStyles, applyStyle, copyTemplateStyles, setHeader, writeDateRow, prepareSheet };
