'use strict';

const ExcelJS = require('exceljs');

const SOURCE_SHEET = 'TG-KH-TT';
const KEEP_VISIBLE = new Set([
  'TỔNG ĐIỂM',
  'Cắt lồng',
  'Tổng KH-TT theo mã sản phẩm',
  'Tổng KH-TT theo máy'
]);

function textOf(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((x) => String(x?.text ?? '')).join('');
    if (value.text !== undefined) return String(value.text ?? '');
    if (value.result !== undefined) return String(value.result ?? '');
  }
  return String(value);
}

function normalized(value) {
  return textOf(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function findSummaryHeadings(sheet) {
  const headings = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const text = normalized(cell.value);
      if (!text.includes('TONG KH-TT')) return;
      if (text.includes('MA SAN PHAM')) headings.push({ kind: 'product', row: rowNumber, col: columnNumber });
      if (text.includes('THEO MAY')) headings.push({ kind: 'machine', row: rowNumber, col: columnNumber });
    });
  });
  return headings;
}

function cloneCell(sourceCell, targetCell) {
  targetCell.value = sourceCell.value;
  if (sourceCell.style) targetCell.style = JSON.parse(JSON.stringify(sourceCell.style));
  if (sourceCell.numFmt) targetCell.numFmt = sourceCell.numFmt;
  if (sourceCell.font) targetCell.font = JSON.parse(JSON.stringify(sourceCell.font));
  if (sourceCell.alignment) targetCell.alignment = JSON.parse(JSON.stringify(sourceCell.alignment));
  if (sourceCell.border) targetCell.border = JSON.parse(JSON.stringify(sourceCell.border));
  if (sourceCell.fill) targetCell.fill = JSON.parse(JSON.stringify(sourceCell.fill));
  if (sourceCell.protection) targetCell.protection = JSON.parse(JSON.stringify(sourceCell.protection));
  if (sourceCell.hidden) targetCell.hidden = sourceCell.hidden;
}

function rangeParts(range) {
  const match = String(range).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!match) return null;
  const col = (letters) => {
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
    return n;
  };
  return {
    minCol: col(match[1]),
    minRow: Number(match[2]),
    maxCol: col(match[3]),
    maxRow: Number(match[4])
  };
}

function copyRegion(source, target, region) {
  const width = region.maxCol - region.minCol + 1;
  const height = region.maxRow - region.minRow + 1;
  if (width <= 0 || height <= 0) throw new Error('Vùng tách sheet không hợp lệ.');

  for (let c = 0; c < width; c += 1) {
    const sourceColumn = source.getColumn(region.minCol + c);
    const targetColumn = target.getColumn(c + 1);
    targetColumn.width = sourceColumn.width;
    targetColumn.hidden = sourceColumn.hidden;
    targetColumn.outlineLevel = sourceColumn.outlineLevel;
  }

  for (let r = 0; r < height; r += 1) {
    const sourceRow = source.getRow(region.minRow + r);
    const targetRow = target.getRow(r + 1);
    targetRow.height = sourceRow.height;
    targetRow.hidden = sourceRow.hidden;
    targetRow.outlineLevel = sourceRow.outlineLevel;
    for (let c = 0; c < width; c += 1) {
      cloneCell(sourceRow.getCell(region.minCol + c), targetRow.getCell(c + 1));
    }
  }

  const colName = (n) => {
    let s = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  for (const merge of source.mergedCells || []) {
    const parsed = rangeParts(merge);
    if (!parsed) continue;
    if (
      parsed.minCol >= region.minCol && parsed.maxCol <= region.maxCol
      && parsed.minRow >= region.minRow && parsed.maxRow <= region.maxRow
    ) {
      const targetRange = `${colName(parsed.minCol - region.minCol + 1)}${parsed.minRow - region.minRow + 1}:${colName(parsed.maxCol - region.minCol + 1)}${parsed.maxRow - region.minRow + 1}`;
      try { target.mergeCells(targetRange); } catch (_) {}
    }
  }
}

function removeIfExists(workbook, name) {
  const sheet = workbook.getWorksheet(name);
  if (sheet) workbook.removeWorksheet(sheet.id);
}

async function splitAndReduceGcWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const source = workbook.getWorksheet(SOURCE_SHEET);
  if (!source) return buffer;

  const headings = findSummaryHeadings(source);
  const productHeading = headings.find((item) => item.kind === 'product');
  const machineHeading = headings.find((item) => item.kind === 'machine');

  if (!productHeading || !machineHeading) {
    console.warn('[KTC-EXCEL-SHEETS] SUMMARY_HEADINGS_NOT_FOUND', JSON.stringify({ headings }));
    return buffer;
  }

  const maxRow = source.rowCount;
  const maxCol = source.columnCount;
  let productRegion;
  let machineRegion;

  // Hai bảng cùng hàng => nằm cạnh nhau theo chiều ngang.
  if (Math.abs(productHeading.row - machineHeading.row) <= 3) {
    const splitCol = Math.max(productHeading.col, machineHeading.col);
    const productIsLeft = productHeading.col < machineHeading.col;
    const left = { minCol: 1, maxCol: splitCol - 1 };
    const right = { minCol: splitCol, maxCol };
    if (productIsLeft) {
      productRegion = { ...left, minRow: 1, maxRow };
      machineRegion = { ...right, minRow: 1, maxRow };
    } else {
      machineRegion = { ...left, minRow: 1, maxRow };
      productRegion = { ...right, minRow: 1, maxRow };
    }
  } else {
    // Hai bảng xếp theo chiều dọc.
    const splitRow = Math.max(productHeading.row, machineHeading.row);
    const productIsTop = productHeading.row < machineHeading.row;
    const top = { minRow: 1, maxRow: splitRow - 1 };
    const bottom = { minRow: splitRow, maxRow };
    if (productIsTop) {
      productRegion = { ...top, minCol: 1, maxCol };
      machineRegion = { ...bottom, minCol: 1, maxCol };
    } else {
      machineRegion = { ...top, minCol: 1, maxCol };
      productRegion = { ...bottom, minCol: 1, maxCol };
    }
  }

  removeIfExists(workbook, 'Tổng KH-TT theo mã sản phẩm');
  removeIfExists(workbook, 'Tổng KH-TT theo máy');

  const productSheet = workbook.addWorksheet('Tổng KH-TT theo mã sản phẩm');
  const machineSheet = workbook.addWorksheet('Tổng KH-TT theo máy');
  copyRegion(source, productSheet, productRegion);
  copyRegion(source, machineSheet, machineRegion);

  // Giữ sheet nguồn để công thức của TỔNG ĐIỂM không bị #REF!,
  // nhưng ẩn toàn bộ các sheet trung gian/không cần dùng.
  workbook.eachSheet((sheet) => {
    if (sheet.name === '_KTC_META') {
      sheet.state = 'veryHidden';
      return;
    }
    sheet.state = KEEP_VISIBLE.has(sheet.name) ? 'visible' : 'veryHidden';
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { splitAndReduceGcWorkbook };
