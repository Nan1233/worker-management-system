'use strict';

// Fills the clean 04_CAT_LONG template ("Báo cáo công nhân") with approved GC
// reports. Layout, styles, date rows and conditional formats come from the
// template itself; only input cells are written and AA keeps its formula.

const { LAYOUTS } = require('../config/excelLayouts');
const { buildLayoutResolvers, writeDetailColumns } = require('./excelColumnMapping');
const { buildGcWorkerRows } = require('./gcWorkerReportRows');

const LAYOUT_CODE = 'GIA_CONG_04';
const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));
const columnLetter = (n) => { let s = ''; let x = n; while (x > 0) { const m = (x - 1) % 26; s = String.fromCharCode(65 + m) + s; x = Math.floor((x - m) / 26); } return s; };

const dayKey = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const excelDate = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

const captureRow = (sheet, rowNumber, lastColumn) => {
  const row = sheet.getRow(rowNumber);
  return {
    height: row.height,
    styles: Array.from({ length: lastColumn }, (_, i) => clone(row.getCell(i + 1).style))
  };
};
const applyRowStyle = (sheet, rowNumber, proto) => {
  const row = sheet.getRow(rowNumber);
  if (proto.height) row.height = proto.height;
  proto.styles.forEach((style, i) => { row.getCell(i + 1).style = clone(style); });
};
const clearRow = (sheet, rowNumber, lastColumn) => {
  const row = sheet.getRow(rowNumber);
  for (let c = 1; c <= lastColumn; c += 1) row.getCell(c).value = null;
};

/**
 * @param sheet ExcelJS worksheet of 04_CAT_LONG_template.xlsx
 * @param reports approved GC reports (with machineLines / deductions / defects)
 * @returns {{ rowCount, dayCount, unmapped, warnings }}
 */
function writeGcWorkerSheet(sheet, reports, { deductionTypes = [], defectTypes = [] } = {}) {
  const layout = LAYOUTS[LAYOUT_CODE];
  const { fixed, lastColumn } = layout;
  const mapping = {
    ...buildLayoutResolvers(sheet, layout, LAYOUT_CODE),
    deductionNameById: new Map(deductionTypes.map((type) => [Number(type.id), type.deduction_name || type.name])),
    defectNameById: new Map(defectTypes.map((type) => [Number(type.id), type.defect_name || type.name])),
    unmapped: []
  };

  const dateProto = captureRow(sheet, layout.dateStyleRow, lastColumn);
  const dataProto = captureRow(sheet, layout.dataStyleRow, lastColumn);
  const cfRules = sheet.conditionalFormattings?.[0]?.rules || [];

  const days = new Map();
  for (const report of reports) {
    const key = dayKey(report.work_date);
    if (!key) continue;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(report);
  }
  if (!days.size) return { rowCount: 0, dayCount: 0, unmapped: [], warnings: [] };

  for (let r = layout.dateStyleRow; r <= layout.dataStyleRow; r += 1) clearRow(sheet, r, lastColumn);

  let rowNumber = layout.dateStyleRow;
  let rowCount = 0;
  const warnings = [];
  const cfRanges = [];
  for (const key of [...days.keys()].sort()) {
    applyRowStyle(sheet, rowNumber, dateProto);
    clearRow(sheet, rowNumber, lastColumn);
    sheet.getRow(rowNumber).getCell(1).value = excelDate(key);
    rowNumber += 1;
    const firstData = rowNumber;
    let sequence = 0;
    for (const report of days.get(key)) {
      for (const item of buildGcWorkerRows(report)) {
        sequence += 1;
        applyRowStyle(sheet, rowNumber, dataProto);
        const row = sheet.getRow(rowNumber);
        clearRow(sheet, rowNumber, lastColumn);
        row.getCell(fixed.sequence).value = sequence;
        row.getCell(fixed.workerCode).value = String(item.workerCode ?? '').trim();
        row.getCell(fixed.workerName).value = item.workerName;
        if (item.machine) row.getCell(fixed.machine).value = item.machine;
        row.getCell(fixed.shift).value = item.shift;
        row.getCell(fixed.totalHours).value = item.totalHours;
        row.getCell(fixed.workedHours).value = item.workedHours;
        row.getCell(fixed.deductionTotal).value = {
          formula: `SUM(${columnLetter(layout.deductions[0])}${rowNumber}:${columnLetter(layout.deductions[1])}${rowNumber})`,
          result: item.deductionHours
        };
        row.getCell(fixed.product).value = item.product;
        row.getCell(fixed.standard).value = item.standard;
        row.getCell(fixed.tt).value = item.tt;
        row.getCell(fixed.ok).value = item.ok;
        row.getCell(fixed.totalNg).value = item.ng;
        row.getCell(fixed.achievement).value = {
          formula: `IFERROR(${columnLetter(fixed.tt)}${rowNumber}/${columnLetter(fixed.standard)}${rowNumber},0)`,
          result: item.standard > 0 ? item.tt / item.standard : 0
        };
        writeDetailColumns(row, { id: item.reportId, machine: item.machine, deductions: item.deductions, defects: item.defects }, mapping, { blankZero: true });
        for (const code of item.warnings) warnings.push({ code, reportId: item.reportId, machine: item.machine, workerCode: item.workerCode });
        rowNumber += 1;
        rowCount += 1;
      }
    }
    if (rowNumber > firstData) cfRanges.push(`${columnLetter(fixed.achievement)}${firstData}:${columnLetter(fixed.achievement)}${rowNumber - 1}`);
  }

  const lastRow = rowNumber - 1;
  sheet.conditionalFormattings = cfRanges.map((ref) => ({ ref, rules: clone(cfRules) }));
  sheet.autoFilter = `A${layout.labelRow}:${columnLetter(lastColumn)}${lastRow}`;
  sheet.pageSetup.printArea = `A1:${columnLetter(lastColumn)}${lastRow}`;
  return { rowCount, dayCount: days.size, unmapped: mapping.unmapped, warnings };
}

module.exports = { writeGcWorkerSheet, LAYOUT_CODE };
