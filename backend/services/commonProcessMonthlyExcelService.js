'use strict';

const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');
const { getMonthlyTarget } = require('./consolidatedExcelExportService');
const { resolveTemplatePath, normalizeLabel } = require('./excelTemplateContractService');

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

function clearSheetData(sheet) {
  for (const range of [...(sheet.mergedCells || [])]) { try { sheet.unMergeCells(range); } catch (_) {} }
  for (let r = 1; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= sheet.columnCount; c += 1) row.getCell(c).value = null;
  }
  if (Array.isArray(sheet.conditionalFormattings)) sheet.conditionalFormattings.length = 0;
  if (sheet.model) sheet.model.conditionalFormattings = [];
  for (let c = LAST_COLUMN + 1; c <= sheet.columnCount; c += 1) sheet.getColumn(c).hidden = true;
}

function captureRowStyles(sheet, rowNumber) {
  const result = [];
  const row = sheet.getRow(rowNumber);
  for (let c = 1; c <= LAST_COLUMN; c += 1) {
    const cell = row.getCell(c);
    result.push({ style: clone(cell.style), font: clone(cell.font), fill: clone(cell.fill), border: clone(cell.border), alignment: clone(cell.alignment), protection: clone(cell.protection), numFmt: cell.numFmt });
  }
  return result;
}
function applyStyle(cell, source) {
  if (!source) return;
  if (source.style) cell.style = clone(source.style);
  if (source.font) cell.font = clone(source.font);
  if (source.fill) cell.fill = clone(source.fill);
  if (source.border) cell.border = clone(source.border);
  if (source.alignment) cell.alignment = clone(source.alignment);
  if (source.protection) cell.protection = clone(source.protection);
  if (source.numFmt) cell.numFmt = source.numFmt;
}
function copyTemplateStyles(sheet, sourceRow, targetRow, styles) {
  const row = sheet.getRow(targetRow); row.height = sheet.getRow(sourceRow).height || 18;
  for (let c = 1; c <= LAST_COLUMN; c += 1) applyStyle(row.getCell(c), styles[c - 1]);
}
function setHeader(sheet, rowNumber, styles, deductions, defects) {
  copyTemplateStyles(sheet, 3, rowNumber, styles);
  const headers = [
    'STT', 'Mã CN', 'Họ tên', 'Số máy', 'Ca', '% học việc', 'Tổng thời gian', 'Thời gian thực tế', 'Số lần CM', 'Tổng TG trừ giờ', 'Thiếu sản lượng',
    ...Array.from({ length: MAX_DEDUCTIONS }, (_, i) => deductions[i]?.name || ''),
    'SP', 'Định mức', 'TT', 'Tỷ lệ đạt', 'Ngày', 'SLSP/h', 'OK', 'Tổng NG', 'Tỷ lệ NG',
    ...Array.from({ length: MAX_DEFECTS }, (_, i) => defects[i]?.name || ''), 'OK', 'NG'
  ];
  headers.forEach((value, index) => {
    const cell = sheet.getRow(rowNumber).getCell(index + 1);
    cell.value = value; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.font = { ...(cell.font || {}), bold: true };
  });
  sheet.getRow(rowNumber).height = 44;
}
function writeDateRow(sheet, rowNumber, text, style) {
  const row = sheet.getRow(rowNumber); row.height = 25;
  for (let c = 1; c <= LAST_COLUMN; c += 1) applyStyle(row.getCell(c), style[c - 1]);
  sheet.mergeCells(rowNumber, 1, rowNumber, LAST_COLUMN);
  const cell = row.getCell(1); cell.value = text;
  cell.font = { ...(cell.font || {}), bold: true, size: Math.max(11, Number(cell.font?.size || 10) + 1) };
  cell.alignment = { horizontal: 'left', vertical: 'middle' };
}
function detailValue(items, id, name, key) {
  const target = alias(name);
  return (items || []).filter((item) => {
    const itemId = Number(item?.[key === 'hours' ? 'deduction_type_id' : 'defect_type_id'] ?? item?.id);
    const itemName = alias(item?.name || item?.deduction_name || item?.defect_name || item?.code || item?.deduction_code || item?.defect_code);
    return (id && itemId === Number(id)) || (target && itemName && (itemName === target || itemName.includes(target) || target.includes(itemName)));
  }).reduce((sum, item) => sum + num(item?.[key] ?? item?.quantity ?? item?.value), 0);
}
function writeReportRow(sheet, rowNumber, report, deductionTypes, defectTypes, dataStyles, index) {
  copyTemplateStyles(sheet, 6, rowNumber, dataStyles);
  const row = sheet.getRow(rowNumber);
  const totalTime = num(report.total_time), actualTime = num(report.actual_time || report.total_time), deductionTime = num(report.deduction_time);
  const standard = num(report.standard_output), actual = num(report.actual_output), ok = num(report.tt_ok), ng = num(report.tt_ng);
  const achievement = standard > 0 ? actual / standard : 0, outputPerHour = actualTime > 0 ? actual / actualTime : 0, ngRate = actual > 0 ? ng / actual : 0;
  const deductions = Array.isArray(report.deductions) ? report.deductions : [], defects = Array.isArray(report.defects) ? report.defects : [];
  const values = [
    index + 1, report.worker_code ?? '', report.full_name ?? report.worker_name ?? '', report.machine_no ?? '', report.shift ?? '',
    report.training_percent ?? report.training_percent_snapshot ?? null, totalTime, actualTime,
    detailValue(deductions, null, 'Chuyển mã', 'hours'), deductionTime, Math.max(0, standard - actual),
    ...deductionTypes.slice(0, MAX_DEDUCTIONS).map((t) => detailValue(deductions, t.id, t.name, 'hours')),
    report.product_name ?? '', standard, actual, achievement,
    dateKey(report.work_date) ? new Date(`${dateKey(report.work_date)}T00:00:00`) : null,
    outputPerHour, ok, ng, ngRate,
    ...defectTypes.slice(0, MAX_DEFECTS).map((t) => detailValue(defects, t.id, t.name, 'quantity')), ok, ng
  ];
  for (let c = 1; c <= LAST_COLUMN; c += 1) row.getCell(c).value = values[c - 1] ?? null;
  row.getCell(6).numFmt = '0%'; row.getCell(28).numFmt = '0.00'; row.getCell(29).numFmt = '0.00'; row.getCell(30).numFmt = '0%'; row.getCell(31).numFmt = 'dd/mm/yyyy'; row.getCell(32).numFmt = '0.00'; row.getCell(35).numFmt = '0%';
  row.getCell(30).font = { ...(row.getCell(30).font || {}), bold: true }; row.getCell(35).font = { ...(row.getCell(35).font || {}), bold: true };
}
function prepareSheet(sheet) {
  const headerStyles = captureRowStyles(sheet, 3), dataStyles = captureRowStyles(sheet, Math.min(6, sheet.rowCount)), dateStyles = captureRowStyles(sheet, 1);
  const widths = Array.from({ length: LAST_COLUMN }, (_, i) => sheet.getColumn(i + 1).width);
  clearSheetData(sheet); widths.forEach((width, i) => { if (width != null) sheet.getColumn(i + 1).width = width; });
  return { headerStyles, dataStyles, dateStyles };
}

async function buildCommonProcessMonthlyWorkbook(reports, yearMonth, options = {}) {
  const templatePath = await resolveTemplatePath();
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(templatePath);
  const reportList = [...(reports || [])].sort((a, b) => dateKey(a.work_date).localeCompare(dateKey(b.work_date)) || String(a.worker_code || '').localeCompare(String(b.worker_code || ''), undefined, { numeric: true }) || Number(a.id) - Number(b.id));
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
    const processDeductions = [...new Map(items.flatMap((r) => r.deductions || []).map((x) => [Number(x.deduction_type_id || x.id), x])).values()].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id || a.deduction_type_id || 0) - Number(b.id || b.deduction_type_id || 0));
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

module.exports = { buildCommonProcessMonthlyWorkbook };
