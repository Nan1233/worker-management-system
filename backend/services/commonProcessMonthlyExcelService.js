'use strict';

const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { getMonthlyTarget } = require('./consolidatedExcelExportService');
const { resolveTemplatePath, normalizeLabel } = require('./excelTemplateContractService');
const { resolveReportExportTimes } = require('./commonProcessExportTimes');
const { expandGiaCongMachineLines } = require('./gcCommonProcessExcelRows');
const { buildCommonProcessExcelRowValues } = require('./commonProcessExcelRowValues');
const { clearSheetData, copyTemplateStyles, setHeader, writeDateRow, prepareSheet } = require('./commonProcessExcelSheetFormatting');

const TEMPLATE_SHEETS = ['CÁN', 'EP', 'XLBV', 'Cắt lồng', 'TT Mài', 'TT Đo', 'TT Kiểm 1', 'TT Kiểm 2'];
const MAX_DEDUCTIONS = 15;
const MAX_DEFECTS = 16;
const LAST_COLUMN = 53;

const PROCESS_ALIASES = [
  ['can', 'CÁN'], ['ep', 'EP'], ['xlbv', 'XLBV'], ['cat long', 'Cắt lồng'],
  ['mai', 'TT Mài'], ['do', 'TT Đo'], ['kiem 1', 'TT Kiểm 1'], ['kiem 2', 'TT Kiểm 2']
];

function alias(value) { return normalizeLabel(value); }
function num(value) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
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
function sheetForProcess(name) {
  const label = alias(name);
  const found = PROCESS_ALIASES.find(([key]) => label.includes(alias(key)));
  return found ? found[1] : null;
}
function safeSheetName(name) {
  const cleaned = String(name || 'BC công đoạn').replace(/[\\/*?:\[\]]/g, ' ').trim();
  return cleaned.slice(0, 31) || 'BC công đoạn';
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
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
  const grouped = new Map();
  for (const report of reportList) {
    const sheetName = sheetForProcess(report.process_name) || safeSheetName(report.process_name || 'BC công đoạn');
    if (!grouped.has(sheetName)) grouped.set(sheetName, []); grouped.get(sheetName).push(report);
  }
  const allSheetNames = new Set(TEMPLATE_SHEETS); for (const name of grouped.keys()) allSheetNames.add(name);
  for (const name of [...allSheetNames]) {
    let sheet = workbook.getWorksheet(name); if (!sheet) sheet = workbook.addWorksheet(safeSheetName(name));
    const styles = prepareSheet(sheet), items = grouped.get(name) || [];
    if (!items.length) {
      writeDateRow(sheet, 1, `BÁO CÁO CÔNG ĐOẠN – ${name} – THÁNG ${String(yearMonth).slice(5, 7)}/${String(yearMonth).slice(0, 4)}`, styles.dateStyles);
      setHeader(sheet, 3, styles.headerStyles, [], []); continue;
    }
    const processDeductions = [...new Map(items.flatMap((r) => r.excelExportTimes?.hasMachine ? r.excelExportTimes.deductions : (r.deductions || [])).map((x) => [Number(x.deduction_type_id || x.id), x])).values()].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id || a.deduction_type_id || 0) - Number(b.id || b.deduction_type_id || 0));
    const processDefects = [...new Map(items.flatMap((r) => r.defects || []).map((x) => [Number(x.defect_type_id || x.id), x])).values()].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id || a.defect_type_id || 0) - Number(b.id || b.defect_type_id || 0));
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
