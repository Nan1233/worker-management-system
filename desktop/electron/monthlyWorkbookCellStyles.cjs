'use strict';
const { COLORS } = require('./monthlyWorkbookStyles.cjs');

function thinBorder() {
  return {
    top: { style: 'thin', color: { argb: COLORS.border } },
    left: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } }
  };
}

function solidFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function applyAllBorders(sheet, { fromRow = 1, toRow = null, fromCol = 1, toCol = null } = {}) {
  const lastRow = Math.max(fromRow, Number(toRow || sheet.rowCount || 0));
  const lastCol = Math.max(fromCol, Number(toCol || sheet.columnCount || 0));
  for (let row = fromRow; row <= lastRow; row += 1) {
    for (let col = fromCol; col <= lastCol; col += 1) {
      sheet.getCell(row, col).border = thinBorder();
    }
  }
}

function applyCellStyle(cell, options = {}) {
  // Ghi đè đầy đủ style để Excel luôn hiển thị nội dung ngay khi mở file.
  cell.font = {
    name: 'Arial',
    size: options.size ?? 8,
    bold: Boolean(options.bold),
    italic: Boolean(options.italic),
    color: { argb: options.fontColor || COLORS.black }
  };
  cell.fill = solidFill(options.fill || COLORS.white);
  cell.border = options.border === false ? {} : thinBorder();
  cell.alignment = {
    horizontal: options.align || 'center',
    vertical: 'middle',
    wrapText: options.wrap === true,
    shrinkToFit: options.shrink === true,
    textRotation: 0,
    indent: options.indent || 0
  };
  cell.protection = { locked: true, hidden: false };
}

module.exports = { thinBorder, solidFill, applyAllBorders, applyCellStyle };
