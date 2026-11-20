'use strict';
const { resolveWorkerParticipationTimes } = require('./exportMachineTime.cjs');

// Group worker rows by production date while preserving template styling and formulas.
function createWorkerReportDateGrouping({
  findColumnMap, pickExact, applyReportRow, plannedOutputFor, writeValue, number, asDate,
}) {
function findDateSeparatorRow(sheet, headerRow, dataStartRow) {
  for (let r = headerRow + 1; r < dataStartRow; r += 1) {
    const row = sheet.getRow(r);
    const first = row.getCell(1).value;
    const isDate = first instanceof Date || /[dmy]/i.test(String(row.getCell(1).numFmt || ''));
    if (isDate && first != null && first !== '') return r;
  }
  return null;
}

function snapshotRow(sheet, rowNumber, columnCount) {
  const row = sheet.getRow(rowNumber);
  const styles = [];
  for (let c = 1; c <= columnCount; c += 1) styles[c] = JSON.parse(JSON.stringify(row.getCell(c).style || {}));
  return { height: row.height, styles };
}

function applySnapshot(row, snapshot, columnCount) {
  if (snapshot.height) row.height = snapshot.height;
  for (let c = 1; c <= columnCount; c += 1) {
    const cell = row.getCell(c);
    cell.value = null;
    cell.style = JSON.parse(JSON.stringify(snapshot.styles[c] || {}));
  }
}

function columnLetter(column) {
  let value = Number(column);
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function writeGroupedByDate(sheet, reports, contract, processData, dateRowNumber, dataStartRow, columnMap, headerRow) {
  const columnCount = Math.max(sheet.columnCount, Number(contract.lastColumn || 0));
  const dateSnapshot = snapshotRow(sheet, dateRowNumber, columnCount);
  const dataSnapshot = snapshotRow(sheet, dataStartRow, columnCount);
  // Read the header row as it stands now: addDerivedColumns may have inserted
  // columns after columnMap was built, so cached indexes would be stale.
  const liveMap = findColumnMap(sheet, headerRow);
  const percentColumn = pickExact(liveMap, '%tt', '% tt');
  const outputLetter = contract.cols.output ? columnLetter(contract.cols.output) : null;
  const standardLetter = contract.cols.standard ? columnLetter(contract.cols.standard) : null;
  const percentFormat = sheet.getRow(dataStartRow + 1).getCell(percentColumn || 1).numFmt || '0%';
  const conditional = (sheet.conditionalFormattings || [])
    .find((item) => percentColumn && String(item.ref || '').startsWith(columnLetter(percentColumn)));

  // Remove every template sample row; rows are rebuilt from the DB below.
  // ExcelJS spliceRows does not reliably drop thousands of rows, so truncate
  // the internal row list directly (rows are 1-based; keep 1..dateRowNumber-1).
  if (Array.isArray(sheet._rows)) sheet._rows.length = dateRowNumber - 1;
  else sheet.spliceRows(dateRowNumber, sheet.rowCount - dateRowNumber + 1);

  const dayKey = (report) => {
    const day = asDate(report.work_date);
    return day ? day.toISOString().slice(0, 10) : '';
  };
  const ordered = [...reports].sort((a, b) => dayKey(a).localeCompare(dayKey(b)) || number(a?.id) - number(b?.id));
  const groups = new Map();
  for (const report of ordered) {
    const day = asDate(report.work_date);
    const key = day ? day.toISOString().slice(0, 10) : '';
    if (!groups.has(key)) groups.set(key, { day, reports: [] });
    groups.get(key).reports.push(report);
  }

  let rowNumber = dateRowNumber;
  const percentRanges = [];
  for (const group of groups.values()) {
    const dateRow = sheet.getRow(rowNumber);
    applySnapshot(dateRow, dateSnapshot, columnCount);
    dateRow.getCell(1).value = group.day;
    dateRow.getCell(1).numFmt = 'mmm-dd';
    rowNumber += 1;
    const firstDataRow = rowNumber;
    group.reports.forEach((report, index) => {
      const row = sheet.getRow(rowNumber);
      applySnapshot(row, dataSnapshot, columnCount);
      applyReportRow(row, report, contract, processData, index);
      const exportTimes = resolveWorkerParticipationTimes(report);
      const totalMinutes = exportTimes.hasMachine
        ? exportTimes.totalHours * 60
        : (
          report.total_minutes !== null
            && report.total_minutes !== undefined
            && report.total_minutes !== ''
            ? number(report.total_minutes)
            : (
              report.work_minutes !== null
                && report.work_minutes !== undefined
                && report.work_minutes !== ''
                ? number(report.work_minutes) + number(report.deduction_time) * 60
                : number(report.total_time ?? report.actual_time) * 60
            )
        );
      writeValue(row, contract.cols.workTime, totalMinutes / 60);
      if (percentColumn && outputLetter && standardLetter) {
        const cell = row.getCell(percentColumn);
        const { planned } = plannedOutputFor(report);
        const output = number(report.actual_output ?? report.tt_ok);
        cell.value = {
          formula: `IFERROR(${outputLetter}${rowNumber}/${standardLetter}${rowNumber},0)`,
          result: planned ? output / planned : 0
        };
        cell.numFmt = percentFormat;
      }
      rowNumber += 1;
    });
    if (percentColumn) percentRanges.push(`${columnLetter(percentColumn)}${firstDataRow}:${columnLetter(percentColumn)}${rowNumber - 1}`);
  }

  // %TT colour bands (the template file no longer carries them):
  //   < 80%          red
  //   80% - < 90%    yellow
  //   90% - 100%     green
  //   > 100%         pink
  sheet.conditionalFormattings = [];
  if (percentColumn && percentRanges.length) {
    const col = columnLetter(percentColumn);
    const firstRow = Number(percentRanges[0].match(/\d+/)[0]);
    const cell = `${col}${firstRow}`;
    const fill = (argb) => ({ fill: { type: 'pattern', pattern: 'solid', bgColor: { argb } } });
    sheet.addConditionalFormatting({
      ref: percentRanges.join(' '),
      rules: [
        { type: 'expression', priority: 1, formulae: [`AND(ISNUMBER(${cell}),${cell}<0.8)`], style: fill('FFFF0000') },
        { type: 'expression', priority: 2, formulae: [`AND(ISNUMBER(${cell}),${cell}>=0.8,${cell}<0.9)`], style: fill('FFFFFF00') },
        { type: 'expression', priority: 3, formulae: [`AND(ISNUMBER(${cell}),${cell}>=0.9,${cell}<=1)`], style: fill('FF92D050') },
        { type: 'expression', priority: 4, formulae: [`AND(ISNUMBER(${cell}),${cell}>1)`], style: fill('FFFF99CC') }
      ]
    });
  }

  // The template carries an oversized legacy filter/print range (e.g. AV2366).
  // Rebuild both from the actual output, including appended CAT/LONG defect columns.
  const lastRow = Math.max(headerRow, rowNumber - 1);
  const detailColumns = [
    ...contract.deductions.map((item) => Number(item.column) || 0),
    ...contract.defects.map((item) => Number(item.column) || 0)
  ];
  const fixedColumns = Object.values(contract.cols).map(Number).filter(Number.isFinite);
  const lastColumn = Math.max(Number(contract.lastColumn) || 1, ...fixedColumns, ...detailColumns, 1);
  sheet.autoFilter = `A${headerRow}:${columnLetter(lastColumn)}${lastRow}`;
  sheet.pageSetup.printArea = `A1:${columnLetter(lastColumn)}${lastRow}`;
}



return { findDateSeparatorRow, writeGroupedByDate };
}
module.exports = { createWorkerReportDateGrouping };
