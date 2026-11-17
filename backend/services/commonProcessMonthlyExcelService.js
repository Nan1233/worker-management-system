'use strict';

const ExcelJS = require('exceljs');
const { resolveTemplatePath } = require('./excelTemplateContractService');
const { saveCommonProcessMonthlyWorkbook } = require('./commonProcessExcelPersistence');
const { dateKey, prepareCommonProcessExcelReports } = require('./commonProcessExcelReportPreparation');
const { expandGiaCongMachineLines } = require('./gcCommonProcessExcelRows');
const { buildCommonProcessExcelRowValues } = require('./commonProcessExcelRowValues');
const {
  TEMPLATE_SHEETS,
  safeSheetName,
  groupReportsByProcessSheet,
  getProcessDetailTypes
} = require('./commonProcessExcelGrouping');
const {
  clearSheetData,
  copyTemplateStyles,
  setHeader,
  writeDateRow,
  prepareSheet
} = require('./commonProcessExcelSheetFormatting');
const { LAST_COLUMN } = require('./commonProcessExcelColumns');

const DATA_CELL_FORMATS = [
  [6, '0%'],
  [28, '0.00'],
  [29, '0.00'],
  [30, '0.00%'],
  [31, 'dd/mm/yyyy'],
  [32, '0.00'],
  [35, '0%']
];
const BOLD_DATA_COLUMNS = [30, 35];

function displayDate(value) {
  const key = dateKey(value);
  if (!key) return '';
  const [year, month, day] = key.split('-');
  return `NGÀY ${day}/${month}/${year}`;
}

function writeReportRow(sheet, rowNumber, report, deductionTypes, defectTypes, dataStyles, index) {
  copyTemplateStyles(sheet, 6, rowNumber, dataStyles);
  const row = sheet.getRow(rowNumber);
  const values = buildCommonProcessExcelRowValues(report, deductionTypes, defectTypes, index);

  for (let column = 1; column <= LAST_COLUMN; column += 1) {
    row.getCell(column).value = values[column - 1] ?? null;
  }

  for (const [column, format] of DATA_CELL_FORMATS) {
    row.getCell(column).numFmt = format;
  }
  for (const column of BOLD_DATA_COLUMNS) {
    const cell = row.getCell(column);
    cell.font = { ...(cell.font || {}), bold: true };
  }
}

function writeEmptySheet(sheet, sheetName, yearMonth, styles) {
  const year = String(yearMonth).slice(0, 4);
  const month = String(yearMonth).slice(5, 7);
  writeDateRow(
    sheet,
    1,
    `BÁO CÁO CÔNG ĐOẠN – ${sheetName} – THÁNG ${month}/${year}`,
    styles.dateStyles
  );
  setHeader(sheet, 3, styles.headerStyles, [], []);
}

function writeDailyReports(sheet, reports, styles) {
  const { processDeductions, processDefects } = getProcessDetailTypes(reports);
  let rowNumber = 1;
  let currentDate = null;

  for (const report of reports) {
    const reportDate = dateKey(report.work_date);
    if (reportDate !== currentDate) {
      if (currentDate !== null) rowNumber += 1; // Blank row between dates.
      writeDateRow(sheet, rowNumber, displayDate(report.work_date), styles.dateStyles);
      rowNumber += 1;
      setHeader(sheet, rowNumber, styles.headerStyles, processDeductions, processDefects);
      rowNumber += 1;
      currentDate = reportDate;
    }

    // Keep the existing index contract unchanged; row numbering is a separate business rule.
    writeReportRow(sheet, rowNumber, report, processDeductions, processDefects, styles.dataStyles, rowNumber);
    rowNumber += 1;
  }

  sheet.views = [{ state: 'frozen', ySplit: 2 }];
  sheet.pageSetup = {
    ...(sheet.pageSetup || {}),
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0
  };
}

function populateWorksheet(workbook, sheetName, reports, yearMonth) {
  let sheet = workbook.getWorksheet(sheetName);
  if (!sheet) sheet = workbook.addWorksheet(safeSheetName(sheetName));

  const styles = prepareSheet(sheet);
  if (reports.length === 0) {
    writeEmptySheet(sheet, sheetName, yearMonth, styles);
    return;
  }
  writeDailyReports(sheet, reports, styles);
}

async function buildCommonProcessMonthlyWorkbook(reports, yearMonth, options = {}) {
  const templatePath = await resolveTemplatePath();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const reportList = prepareCommonProcessExcelReports(reports);
  const grouped = groupReportsByProcessSheet(reportList);
  const allSheetNames = new Set([...TEMPLATE_SHEETS, ...grouped.keys()]);

  for (const name of allSheetNames) {
    populateWorksheet(workbook, name, grouped.get(name) || [], yearMonth);
  }

  workbook.calculation = { fullCalcOnLoad: true, forceFullCalc: true, calcMode: 'auto' };
  return saveCommonProcessMonthlyWorkbook(workbook, yearMonth, templatePath, reportList.length);
}

module.exports = {
  buildCommonProcessMonthlyWorkbook,
  __test: { clearSheetData, expandGiaCongMachineLines }
};
