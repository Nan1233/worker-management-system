'use strict';
const { asText } = require('./monthlyWorkbookValues.cjs');
const { COLORS } = require('./monthlyWorkbookStyles.cjs');
const GC_HELPER_SHEET = 'TAY MÁY CẮT LỒNG';
function createGcModeHelper({ applyCellStyle, solidFill, applyAllBorders }) {
function operationTypeLabel(value) {
  const text = asText(value).toUpperCase();
  if (['CUT','CẮT','CAT'].includes(text)) return 'CẮT';
  if (['NEST','LỒNG','LONG'].includes(text)) return 'LỒNG';
  return '';
}

function operationModeLabel(value) {
  const text = asText(value).toUpperCase();
  if (['MACHINE','MÁY','MAY'].includes(text)) return 'MÁY';
  if (['MANUAL','TAY','THỦ CÔNG','THU CONG'].includes(text)) return 'TAY';
  return '';
}

function addGcModeHelperSheet(workbook, dataSheet, processData, columns) {
  const helper = workbook.addWorksheet(GC_HELPER_SHEET, { views: [{ state: 'frozen', ySplit: 3, showGridLines: false }] });
  helper.mergeCells('A1:J1');
  helper.getCell('A1').value = 'BỔ SUNG THÔNG TIN TAY/MÁY - CẮT/LỒNG';
  applyCellStyle(helper.getCell('A1'), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 15, border: false });
  helper.mergeCells('A2:J2');
  helper.getCell('A2').value = 'Sheet này tự cập nhật từ CẮT LỒNG ngay khi file Excel thay đổi. Với dòng mới, chỉ cần bổ sung Loại thao tác, Chế độ và Máy nếu chọn MÁY.';
  applyCellStyle(helper.getCell('A2'), { fill: COLORS.blueLight, fontColor: COLORS.navy, bold: false, size: 10, border: false, align: 'left' });
  const headers = ['Dòng nguồn','ID','Mã NV','Ca','Mã SP','Loại thao tác','Chế độ','Máy','Trạng thái','Thiếu thông tin'];
  headers.forEach((h,i)=>{ helper.getCell(3,i+1).value=h; applyCellStyle(helper.getCell(3,i+1), { fill: COLORS.blue, fontColor: COLORS.white, bold: true }); });
  [12,10,12,8,18,16,12,18,18,32].forEach((w,i)=>helper.getColumn(i+1).width=w);

  const columnNumberByKey = (key) => {
    const index = columns.findIndex((column) => column.key === key);
    return index >= 0 ? index + 1 : 0;
  };
  const idCol = columnNumberByKey('id');
  const workerCol = columnNumberByKey('workerCode');
  const shiftCol = columnNumberByKey('shift');
  const productCol = columnNumberByKey('product');
  const operationTypeCol = columnNumberByKey('operationType');
  const operationModeCol = columnNumberByKey('operationMode');
  const machineCol = columnNumberByKey('machine');

  // Helper row 4 maps to source row 6, row 5 -> source row 7, ...
  // Pre-seed enough formula rows so rows added manually in Excel appear immediately
  // without needing Electron/EXE to regenerate the helper sheet first.
  // STT số nguyên dương là điều kiện duy nhất để một dòng nguồn xuất hiện ở sheet phụ.
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  const MAX_AUTO_SOURCE_ROW = Math.max(2000, dataSheet.rowCount + 500);
  const dataSheetName = String(dataSheet.name || 'CẮT LỒNG').replace(/'/g, "''");
  const sourceRef = (row, col) => `'${dataSheetName}'!${dataSheet.getColumn(col).letter}${row}`;

  for (let sourceRow = 6; sourceRow <= MAX_AUTO_SOURCE_ROW; sourceRow += 1) {
    const outRow = sourceRow - 2;
    const sttRef = sourceRef(sourceRow, 1);
    const validExpr = `AND(ISNUMBER(${sttRef}),${sttRef}>0)`;
    const formula = (expr) => ({ formula: `IF(${validExpr},${expr},\"\")` });

    helper.getCell(outRow, 1).value = formula(sourceRow);
    helper.getCell(outRow, 2).value = idCol ? formula(sourceRef(sourceRow, idCol)) : '';
    helper.getCell(outRow, 3).value = workerCol ? formula(sourceRef(sourceRow, workerCol)) : '';
    helper.getCell(outRow, 4).value = shiftCol ? formula(sourceRef(sourceRow, shiftCol)) : '';
    helper.getCell(outRow, 5).value = productCol ? formula(sourceRef(sourceRow, productCol)) : '';

    if (operationTypeCol) {
      const ref = sourceRef(sourceRow, operationTypeCol);
      helper.getCell(outRow, 6).value = { formula: `IF(${validExpr},IF(OR(UPPER(${ref})=\"CUT\",UPPER(${ref})=\"CẮT\",UPPER(${ref})=\"CAT\"),\"CẮT\",IF(OR(UPPER(${ref})=\"NEST\",UPPER(${ref})=\"LỒNG\",UPPER(${ref})=\"LONG\"),\"LỒNG\",\"\")),\"\")` };
    }
    if (operationModeCol) {
      const ref = sourceRef(sourceRow, operationModeCol);
      helper.getCell(outRow, 7).value = { formula: `IF(${validExpr},IF(OR(UPPER(${ref})=\"MACHINE\",UPPER(${ref})=\"MÁY\",UPPER(${ref})=\"MAY\"),\"MÁY\",IF(OR(UPPER(${ref})=\"MANUAL\",UPPER(${ref})=\"TAY\"),\"TAY\",\"\")),\"\")` };
    }
    helper.getCell(outRow, 8).value = machineCol ? formula(sourceRef(sourceRow, machineCol)) : '';

    // Status is calculated from the helper cells themselves so manual selections in F:G:H
    // immediately update the message without any EXE action.
    helper.getCell(outRow, 9).value = { formula: `IF($A${outRow}=\"\",\"\",IF(OR($F${outRow}=\"\",$G${outRow}=\"\",AND($G${outRow}=\"MÁY\",$H${outRow}=\"\")),\"THIẾU THÔNG TIN\",\"ĐỦ THÔNG TIN\"))` };
    helper.getCell(outRow, 10).value = { formula: `IF($A${outRow}=\"\",\"\",IF($F${outRow}=\"\",\"Loại thao tác\",\"\")&IF(AND($F${outRow}=\"\",$G${outRow}=\"\"),\", \",\"\")&IF($G${outRow}=\"\",\"Chế độ\",\"\")&IF(AND($G${outRow}=\"MÁY\",$H${outRow}=\"\"),IF(OR($F${outRow}=\"\",$G${outRow}=\"\"),\", Máy\",\"Máy\"),\"\"))` };

    for (let col = 1; col <= 10; col += 1) {
      const isEditableMeta = [6,7,8].includes(col);
      applyCellStyle(helper.getCell(outRow, col), { fill: isEditableMeta ? COLORS.warning : COLORS.white, align: [3,5,10].includes(col) ? 'left' : 'center' });
    }
    helper.getCell(outRow, 9).fill = solidFill(COLORS.warning);
    helper.getCell(outRow, 6).dataValidation = { type:'list', allowBlank:true, formulae:['"CẮT,LỒNG"'] };
    helper.getCell(outRow, 7).dataValidation = { type:'list', allowBlank:true, formulae:['"TAY,MÁY"'] };
    helper.getCell(outRow, 6).protection = { locked:false };
    helper.getCell(outRow, 7).protection = { locked:false };
    helper.getCell(outRow, 8).protection = { locked:false };
  }
  applyAllBorders(helper, { fromRow:3, toRow:MAX_AUTO_SOURCE_ROW - 2, fromCol:1, toCol:10 });
  return helper;
}


return { operationTypeLabel, operationModeLabel, addGcModeHelperSheet };
}
module.exports = { createGcModeHelper };
