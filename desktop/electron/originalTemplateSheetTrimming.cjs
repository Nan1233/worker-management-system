'use strict';

/**
 * Discard the unused styled sample area in an original company worksheet.
 * Use ExcelJS worksheet/row/cell APIs rather than mutating _rows, _cells,
 * _columns or _merges. Keep all cells in the actual report table intact.
 */
function trimOriginalTemplateSheet(sheet, lastDataRow, lastDataColumn) {
  const lastRow = Math.max(1, Math.trunc(Number(lastDataRow) || 1));
  const lastColumn = Math.max(1, Math.trunc(Number(lastDataColumn) || 1));
  const sourceRowCount = sheet.rowCount;
  const sourceColumnCount = sheet.columnCount;

  // ExcelJS splice methods do not guarantee that template-only formatting is
  // dropped. Clear style and value first, then remove the unused rows/columns.
  // Only remove merges whose master lies beyond the retained report area.
  // Preserve merges crossing its boundary; they belong to retained cells.
  const unmerged = new Set();
  let hasCrossingRowMerge = false;
  let hasCrossingColumnMerge = false;
  const isRetainedMerge = (cell) => cell.isMerged && cell.master
    && cell.master.row <= lastRow && cell.master.col <= lastColumn;
  const discardMerge = (cell) => {
    if (!cell.isMerged) return;
    const master = cell.master;
    if (!master || (master.row <= lastRow && master.col <= lastColumn)) return;
    if (unmerged.has(master.address)) return;
    unmerged.add(master.address);
    sheet.unMergeCells(master.address);
  };

  for (let rowNumber = 1; rowNumber <= sourceRowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (rowNumber > lastRow) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (isRetainedMerge(cell)) hasCrossingRowMerge = true;
        else discardMerge(cell);
      });
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (isRetainedMerge(cell)) return;
        cell.value = null;
        cell.style = {};
      });
      continue;
    }
    for (let column = lastColumn + 1; column <= sourceColumnCount; column += 1) {
      const cell = row.getCell(column);
      if (isRetainedMerge(cell)) hasCrossingColumnMerge = true;
      else discardMerge(cell);
    }
  }

  // Once unused merges are removed, public splice operations can shift/remove
  // the trailing sample cells without touching the approved-report region.
  if (sourceRowCount > lastRow && !hasCrossingRowMerge) {
    sheet.spliceRows(lastRow + 1, sourceRowCount - lastRow);
  }
  if (sourceColumnCount > lastColumn) {
    for (let rowNumber = 1; rowNumber <= Math.min(lastRow, sheet.rowCount); rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      for (let column = lastColumn + 1; column <= sourceColumnCount; column += 1) {
        const cell = row.getCell(column);
        if (isRetainedMerge(cell)) continue;
        cell.value = null;
        cell.style = {};
      }
    }
    if (!hasCrossingColumnMerge) {
      sheet.spliceColumns(lastColumn + 1, sourceColumnCount - lastColumn);
    }
  }
}

module.exports = { trimOriginalTemplateSheet };
