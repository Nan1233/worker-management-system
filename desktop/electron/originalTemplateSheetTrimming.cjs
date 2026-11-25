'use strict';
const { cloneExcelStyle } = require('./excelStyleClone.cjs');

// Clip merges at the retained table boundary before deleting sample rows.
// ExcelJS spliceRows/spliceColumns cannot safely move merged ranges.
function trimOriginalTemplateSheet(sheet, lastDataRow, lastDataColumn) {
  const lastRow = Math.max(1, Math.trunc(Number(lastDataRow) || 1));
  const lastColumn = Math.max(1, Math.trunc(Number(lastDataColumn) || 1));
  const sourceRowCount = sheet.rowCount;
  const sourceColumnCount = sheet.columnCount;
  for (const range of [...(sheet.model.merges || [])]) {
    const [start, end = start] = range.split(':');
    const master = sheet.getCell(start);
    const tail = sheet.getCell(end);
    if (tail.row <= lastRow && tail.col <= lastColumn) continue;
    const row = master.row, col = master.col;
    const value = master.value, style = cloneExcelStyle(master.style || {});
    sheet.unMergeCells(range);
    if (row > lastRow || col > lastColumn) continue;
    const bottom = Math.min(tail.row, lastRow);
    const right = Math.min(tail.col, lastColumn);
    if (bottom > row || right > col) sheet.mergeCells(row,col,bottom,right);
    const retained = sheet.getCell(row,col);
    retained.value = value;
    retained.style = style;
  }
  for (let r = lastRow + 1; r <= sourceRowCount; r++) {
    const row = sheet.getRow(r);
    // Assigning an empty values array drops the row's cell models, unlike
    // assigning null to every cell (ExcelJS can serialize styled empty cells).
    row.values=[];
    row.style={}; row.height=undefined; row.hidden=false; row.outlineLevel=0;
  }
  if (sourceRowCount > lastRow) sheet.spliceRows(lastRow+1,sourceRowCount-lastRow);
  if (sourceColumnCount > lastColumn) {
    for (let r=1;r<=Math.min(lastRow,sheet.rowCount);r++) {
      for (let c=lastColumn+1;c<=sourceColumnCount;c++) {
        const cell=sheet.getCell(r,c);cell.value=null;cell.style={};
      }
    }
    sheet.spliceColumns(lastColumn+1,sourceColumnCount-lastColumn);
  }
  // Column splicing can revisit otherwise empty trailing rows. Clear them
  // after the final column operation so they cannot reappear in the XLSX.
  for (let r=lastRow+1;r<=sheet.rowCount;r++) {
    const row=sheet.getRow(r);
    row.values=[]; row.style={}; row.height=undefined; row.hidden=false; row.outlineLevel=0;
  }
}
module.exports={trimOriginalTemplateSheet};
