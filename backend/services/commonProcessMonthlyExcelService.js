'use strict';

const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { getMonthlyTarget } = require('./consolidatedExcelExportService');
const { resolveTemplatePath, normalizeLabel } = require('./excelTemplateContractService');
const { resolveReportExportTimes } = require('./commonProcessExportTimes');
const { expandGiaCongMachineLines } = require('./gcCommonProcessExcelRows');
const { buildCommonProcessExcelRowValues } = require('./commonProcessExcelRowValues');
const { TEMPLATE_SHEETS, safeSheetName, groupReportsByProcessSheet, getProcessDetailTypes } = require('./commonProcessExcelGrouping');
const { clearSheetData, copyTemplateStyles, setHeader, writeDateRow, prepareSheet } = require('./commonProcessExcelSheetFormatting');

const LAST_COLUMN = 53;
function num(value) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function dateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function displayDate(value) {
  const key = dateKey(value); if (!key) return '';
  const [y, m, d] = key.split('-'); return `NGÀY ${d}/${m}/${y}`;
}

function writeReportRow(sheet, rowNumber, report, deductionTypes, defectTypes, dataStyles, index) {
  copyTemplateStyles(sheet, 6, rowNumber, dataStyles);
  const row = sheet.getRow(rowNumber);
  const values = buildCommonProcessExcelRowValues(report, deductionTypes, defectTypes, index);
  for (let c = 1; c <= LAST_COLUMN; c += 1) row.getCell(c).value = values[c - 1] ?? null;
  row.getCell(6).numFmt = '0%';
  row.getCell(28).numFmt = '0.00';
  row.getCell(29).numFmt = '0.00';
  row.getCell(30).numFmt = '0.00%';
  row.getCell(31).numFmt = 'dd/mm/yyyy';
  row.getCell(32).numFmt = '0.00';
  row.getCell(35).numFmt = '0%';
  row.getCell(30).font = { ...(row.getCell(30).font || {}), bold: true };
  row.getCell(35).font = { ...(row.getCell(35).font || {}), bold: true };
}


async function buildCommonProcessMonthlyWorkbook(reports, yearMonth, options = {}) {
  const templatePath = await resolveTemplatePath();
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(templatePath);
  const reportList = expandGiaCongMachineLines(reports).sort((a, b) => dateKey(a.work_date).localeCompare(dateKey(b.work_date)) || String(a.worker_code || '').localeCompare(String(b.worker_code || ''), undefined, { numeric: true }) || Number(a.id) - Number(b.id) || num(a._gcMachineLineId) - num(b._gcMachineLineId));
  for (const report of reportList) { if (!report.excelExportTimes) report.excelExportTimes = resolveReportExportTimes(report); }
  const grouped = groupReportsByProcessSheet(reportList);
  const allSheetNames = new Set(TEMPLATE_SHEETS); for (const name of grouped.keys()) allSheetNames.add(name);
  for (const name of [...allSheetNames]) {
    let sheet = workbook.getWorksheet(name); if (!sheet) sheet = workbook.addWorksheet(safeSheetName(name));
    const styles = prepareSheet(sheet), items = grouped.get(name) || [];
    if (!items.length) {
      writeDateRow(sheet, 1, `BÁO CÁO CÔNG ĐOẠN – ${name} – THÁNG ${String(yearMonth).slice(5, 7)}/${String(yearMonth).slice(0, 4)}`, styles.dateStyles);
      setHeader(sheet, 3, styles.headerStyles, [], []); continue;
    }
    const { processDeductions, processDefects } = getProcessDetailTypes(items);
    let rowNumber = 1, currentDate = null;
    for (const report of items) {
      const day = dateKey(report.work_date);
      if (day !== currentDate) {
        if (currentDate !== null) rowNumber += 1;
        writeDateRow(sheet, rowNumber, displayDate(report.work_date), styles.dateStyles); rowNumber += 1;
        setHeader(sheet, rowNumber, styles.headerStyles, processDeductions, processDefects); rowNumber += 1; currentDate = day;
      }
      writeReportRow(sheet, rowNumber, report, processDeductions, processDefects, styles.dataStyles, rowNumber); rowNumber += 1;
    }
    sheet.views = [{ state: 'frozen', ySplit: 2 }];
    sheet.pageSetup = { ...(sheet.pageSetup || {}), orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  workbook.calculation = { fullCalcOnLoad: true, forceFullCalc: true, calcMode: 'auto' };
  const target = getMonthlyTarget(yearMonth, { stageFolder: 'BC công đoạn' }); await fs.mkdir(target.folder, { recursive: true });
  const tempPath = `${target.filePath}.${process.pid}.${Date.now()}.tmp`; await workbook.xlsx.writeFile(tempPath); await fs.rename(tempPath, target.filePath);
  await fs.writeFile(target.metadataPath, JSON.stringify({ version: 1, template: path.basename(templatePath), layout: 'common-process-daily-blocks', yearMonth, reportCount: reportList.length, updatedAt: new Date().toISOString() }), 'utf8');
  return { archivePath: target.filePath, fileName: target.fileName, reportCount: reportList.length, templateFile: path.basename(templatePath), layout: 'common-process-daily-blocks' };
}

module.exports = { buildCommonProcessMonthlyWorkbook, __test: { clearSheetData, expandGiaCongMachineLines } };
