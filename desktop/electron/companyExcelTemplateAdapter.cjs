'use strict';
const path = require('node:path');
const JSZip = require('jszip');

// Isolate format discovery and legacy OOXML normalization from business report generation.
function createCompanyExcelTemplateAdapter({ safeText }) {
function getMergedCellValue(cell) {
  try {
    if (cell?.isMerged && cell.master && cell.master !== cell) {
      return cell.master.value ?? '';
    }
    return cell?.value ?? '';
  } catch {
    return '';
  }
}

function getFormulaText(value) {
  if (value && typeof value === 'object' && typeof value.formula === 'string') {
    return value.formula.trim();
  }
  if (typeof value === 'string' && value.trim().startsWith('=')) {
    return value.trim().slice(1);
  }
  return '';
}

function normalizedFormula(value) {
  return getFormulaText(value)
    .replace(/^=/, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function isCopiedHeaderRow(sheet, rowNumber) {
  const nextRow = sheet.getRow(rowNumber + 1);
  const formulaB = normalizedFormula(getMergedCellValue(nextRow.getCell(2)));
  const formulaA = normalizedFormula(getMergedCellValue(nextRow.getCell(1)));
  return formulaB.includes('$B$2') || formulaA.includes('$A$2');
}

function isDateAnchorCell(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return true;
  const formula = normalizedFormula(value);
  // ExcelJS lưu công thức trong value.formula, còn value.result có thể là ngày đã cache.
  // Ví dụ TT Mài: A342 là Date; A494 có formula +A342+1.
  return /^\+?\$?A\$?\d+\+1$/i.test(formula);
}

function findDateAnchorRows(sheet) {
  const candidates = [];
  for (let rowNumber = 1; rowNumber < sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const anchorValue = getMergedCellValue(row.getCell(1));
    const columnBValue = getMergedCellValue(row.getCell(2));
    const columnBText = safeText(columnBValue).trim();
    const columnBFormula = getFormulaText(columnBValue);
    if (!isDateAnchorCell(anchorValue)) continue;
    if (columnBText || columnBFormula) continue;
    if (!isCopiedHeaderRow(sheet, rowNumber)) continue;
    candidates.push(rowNumber);
  }

  if (candidates.length <= 1) return candidates;

  // Giữ chuỗi block chi tiết có bước lặp ổn định; loại vùng tổng hợp đầu sheet.
  const gaps = candidates.slice(1).map((row, index) => row - candidates[index]);
  const gapCounts = new Map();
  for (const gap of gaps) {
    if (gap < 20 || gap > 300) continue;
    gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
  }
  const dominantGap = [...gapCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];

  if (!dominantGap) return candidates.slice(0, 31);

  let best = [];
  let current = [candidates[0]];
  for (let index = 1; index < candidates.length; index += 1) {
    const gap = candidates[index] - candidates[index - 1];
    if (Math.abs(gap - dominantGap) <= 2) {
      current.push(candidates[index]);
    } else {
      if (current.length > best.length) best = current;
      current = [candidates[index]];
    }
  }
  if (current.length > best.length) best = current;
  return (best.length ? best : candidates).slice(0, 31);
}

function findTextHeaderRows(sheet, layout) {
  const headers = [];
  const candidateColumns = [layout.headerSearchColumn];
  for (let column = 1; column <= Math.min(sheet.columnCount, layout.lastReportColumn || sheet.columnCount); column += 1) {
    if (!candidateColumns.includes(column)) candidateColumns.push(column);
  }

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    for (const column of candidateColumns) {
      const text = safeText(getMergedCellValue(sheet.getRow(rowNumber).getCell(column))).trim();
      if (!text) continue;
      layout.headerPattern.lastIndex = 0;
      if (layout.headerPattern.test(text)) {
        headers.push(rowNumber);
        break;
      }
    }
  }
  return [...new Set(headers)];
}

function findBlocks(sheet, layout) {
  let headers = [];
  let startOffset = Number(layout.blockStartOffset || 1);
  let endOffset = Number(layout.blockEndOffset || 2);

  if (layout.blockStrategy === 'date-anchor') {
    headers = findDateAnchorRows(sheet);
  }

  if (!headers.length) {
    headers = findTextHeaderRows(sheet, layout);
    startOffset = 1;
    endOffset = 2;
  }

  if (!headers.length) {
    throw new Error(`Không tìm thấy cấu trúc ngày hợp lệ trong sheet ${sheet.name}`);
  }

  // File chuẩn phải có tối đa 31 khối ngày. Loại các kết quả nhiễu ở vùng tổng hợp.
  if (headers.length > 31) headers = headers.slice(0, 31);

  return headers.map((headerRow, index) => ({
    headerRow,
    startRow: headerRow + startOffset,
    endRow: (headers[index + 1] || (sheet.rowCount + endOffset)) - endOffset
  })).filter((block) => block.endRow >= block.startRow);
}


async function normalizeAbsoluteRelationshipTargets(inputBuffer) {
  const zip = await JSZip.loadAsync(inputBuffer);
  const relationshipFiles = Object.keys(zip.files).filter((name) => name.endsWith('.rels'));
  for (const relationshipPath of relationshipFiles) {
    const match = /^(.*)\/_rels\/([^/]+)\.rels$/.exec(relationshipPath);
    const sourcePart = relationshipPath === '_rels/.rels'
      ? ''
      : (match ? `${match[1]}/${match[2]}` : '');
    const sourceDirectory = path.posix.dirname(sourcePart);
    const xml = await zip.file(relationshipPath).async('string');
    const normalized = xml.replace(/Target="([^"]+)"/g, (whole, target) => {
      if (!target.startsWith('/')) return whole;
      const absoluteTarget = target.replace(/^\/+/, '').split(/[?#]/, 1)[0];
      const relativeTarget = sourceDirectory === '.'
        ? absoluteTarget
        : path.posix.relative(sourceDirectory, absoluteTarget);
      const suffix = target.slice(absoluteTarget.length + 1);
      return `Target="${relativeTarget}${suffix}"`;
    });
    if (normalized !== xml) zip.file(relationshipPath, normalized);
  }
  // The source workbook stores legacy comments under nonstandard nested
  // names (xl/comments/commentN.xml and commentsDrawingN.vml). ExcelJS 4.4.0
  // only recognizes xl/commentsN.xml and xl/drawings/vmlDrawingN.vml.
  // Remap the parts and their worksheet relationships in-memory so comments
  // and VML notes are parsed instead of dereferencing an undefined entry.
  for (const entryPath of Object.keys(zip.files)) {
    let match = /^xl\/comments\/comment(\d+)\.xml$/.exec(entryPath);
    if (match) {
      const targetPath = `xl/comments${match[1]}.xml`;
      const data = await zip.file(entryPath).async('nodebuffer');
      zip.file(targetPath, data);
      zip.remove(entryPath);
    }
    match = /^xl\/drawings\/commentsDrawing(\d+)\.vml$/.exec(entryPath);
    if (match) {
      const targetPath = `xl/drawings/vmlDrawing${match[1]}.vml`;
      const data = await zip.file(entryPath).async('nodebuffer');
      zip.file(targetPath, data);
      zip.remove(entryPath);
    }
  }
  for (const relationshipPath of Object.keys(zip.files).filter((name) =>
    /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(name))) {
    const xml = await zip.file(relationshipPath).async('string');
    const normalized = xml
      .replace(/Target="\.\.\/comments\/comment(\d+)\.xml"/g, 'Target="../comments$1.xml"')
      .replace(/Target="\.\.\/drawings\/commentsDrawing(\d+)\.vml"/g, 'Target="../drawings/vmlDrawing$1.vml"');
    if (normalized !== xml) zip.file(relationshipPath, normalized);
  }
  // ExcelJS 4.4.0's DrawingXform matches prefixed xdr:* element names.
  // The original Mài workbook uses the equivalent default namespace form
  // (<wsDr><twoCellAnchor>...), which ExcelJS parses as an empty drawing
  // model and later crashes on drawing.anchors during reconcile().
  // Add the xdr prefix in-memory only; keep every anchor/chart and the
  // source template bytes intact.
  for (const drawingPath of Object.keys(zip.files)) {
    if (!/^xl\/drawings\/drawing\d+\.xml$/.test(drawingPath)) continue;
    const xml = await zip.file(drawingPath).async('string');
    const prefixed = xml
      .replace(/<wsDr\b/, '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"')
      .replace(/<\/wsDr>/, '</xdr:wsDr>')
      .replace(/(<\/?)([A-Za-z_][\w.-]*)(?=[\s/>])/g, (whole, bracket, name) => bracket + 'xdr:' + name);
    if (prefixed !== xml) zip.file(drawingPath, prefixed);
  }
  // ExcelJS 4.4.0 crashes in reconcile() when a drawing .rels part exists
  // without its matching drawing XML. Such orphan relationships carry no
  // renderable drawing; remove only those orphan .rels entries in-memory.
  for (const relationshipPath of Object.keys(zip.files)) {
    const drawingRelsPrefix = 'xl/drawings/_rels/';
    const drawingRelsSuffix = '.xml.rels';
    if (relationshipPath.startsWith(drawingRelsPrefix) && relationshipPath.endsWith(drawingRelsSuffix)) {
      const drawingName = relationshipPath.slice(drawingRelsPrefix.length, -drawingRelsSuffix.length);
      if (!zip.file(`xl/drawings/${drawingName}.xml`)) zip.remove(relationshipPath);
    }
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function materializeSharedFormulas(workbook) {
  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = cell.value;
        if (!value || typeof value !== 'object' || !value.sharedFormula) return;
        try {
          const formula = cell.formula;
          cell.value = formula
            ? { formula, result: value.result ?? cell.result ?? null }
            : (value.result ?? null);
        } catch {
          cell.value = value.result ?? null;
        }
      });
    });
  });
}



  return { findBlocks, normalizeAbsoluteRelationshipTargets, materializeSharedFormulas };
}
module.exports = { createCompanyExcelTemplateAdapter };
