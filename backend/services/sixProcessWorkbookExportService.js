'use strict';

// Export the six production processes from the user-maintained Workbook1.xlsx.
// Column positions are taken from each worksheet's actual header row, not from
// the legacy nine-process workbook.
const ExcelJS = require('exceljs');
const path = require('node:path');
const fs = require('node:fs/promises');
const { normalizeLabel } = require('./excelTemplateContractService');

const SHEETS = Object.freeze({ GC: 'Gia công', MAI: 'Mài', DO: 'Đo', XLBV: 'XLBV', EP: 'Ép', CAN: 'Cán' });
const COLUMNS = Object.freeze({
  GC: { seq:1, submitted:2, worker:3, name:4, training:5, machine:6, shift:7, gross:8, net:9, deducted:10, product:27, standard:28, output:29, rate:30, date:31, perHour:32, ok:33, ng:34, ngRate:35 },
  MAI: { seq:1, submitted:2, worker:3, name:4, shift:5, machine:6, training:9, gross:10, net:11, deducted:12, product:33, standard:34, output:35, rate:36, date:37, perHour:38, ok:39, ng:40, ngRate:41 },
  DO: { seq:1, submitted:2, worker:3, name:4, shift:5, machine:6, training:8, gross:9, net:10, deducted:11, product:29, standard:30, output:31, rate:32, date:33, perHour:34, ok:35, ng:36, ngRate:37 },
  XLBV: { seq:1, submitted:2, worker:3, name:4, shift:12, gross:13, product:14, standard:16, output:17, rate:18, date:19, perHour:20, ng:21, ngRate:22 },
  EP: { seq:1, submitted:2, worker:3, name:4, shift:5, machine:6, deducted:7, net:8, product:9, standard:11, output:12, rate:13, date:14, perHour:15, ng:16 },
  CAN: { seq:1, submitted:2, worker:3, name:4, shift:5, machine:6, net:7, product:9, standard:10, output:11, rate:12, date:13, perHour:14, ng:15, ngRate:16 }
});
const FIRST_ROW = { GC: 5, MAI: 3, DO: 3, XLBV: 3, EP: 3, CAN: 3 };
const HEADER_ROW = { GC: 3, MAI: 1, DO: 1, XLBV: 1, EP: 1, CAN: 1 };
const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const date = (value) => { if (!value) return null; const d = value instanceof Date ? value : new Date(value); return Number.isNaN(d.getTime()) ? null : d; };
const key = (value) => normalizeLabel(value).replace(/^(?:gc|mai|do|xlbv|ep|can)\s*\d+\s*/, '').trim();
const detailName = (item, kind) => item?.[kind + '_name'] || item?.name || item?.[kind + '_code'] || '';
function fillDetails(row, header, report, startColumn, endColumn) {
  const defects = Array.isArray(report.defects) ? report.defects : [];
  const deductions = Array.isArray(report.deductions) ? report.deductions : [];
  for (let col = startColumn; col <= endColumn; col += 1) {
    const title = header.getCell(col).value;
    const label = key(typeof title === 'string' ? title : title?.text || '');
    if (!label || label.length < 2) continue;
    const matches = (item, kind) => {
      const itemKey = key(detailName(item, kind));
      return itemKey && (itemKey === label || (itemKey.length > 3 && label.includes(itemKey)) || (label.length > 3 && itemKey.includes(label)));
    };
    const defect = defects.find((item) => matches(item, 'defect'));
    const deduction = deductions.find((item) => matches(item, 'deduction'));
    if (defect) row.getCell(col).value = num(defect.quantity ?? defect.count ?? defect.value);
    else if (deduction) row.getCell(col).value = num(deduction.hours ?? deduction.time ?? deduction.value);
  }
}
function stripExternalLinks(workbook) {
  workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => {
    const value = cell.value;
    if (value && typeof value === 'object' && value.formula) {
      if (/\[[^\]]+\]|#REF!|VLOOKUP\s*\(/i.test(value.formula)) cell.value = null;
    }
  })));
}
async function buildSixProcessWorkbook(reports, yearMonth, options = {}) {
  const processCode = String(options.processCode || reports?.[0]?.process_code || '').toUpperCase();
  const sheetName = SHEETS[processCode];
  if (!sheetName) throw new Error('Unsupported Workbook1 process: ' + processCode);
  const templatePath = path.resolve(__dirname, '../templates/Workbook1.xlsx');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) throw new Error('Workbook1.xlsx missing sheet ' + sheetName);
  // Each process export must contain only its own worksheet.
  for (const other of [...workbook.worksheets]) if (other.name !== sheetName) workbook.removeWorksheet(other.id);
  const columns = COLUMNS[processCode], first = FIRST_ROW[processCode], header = sheet.getRow(HEADER_ROW[processCode]);
  const sample = sheet.getRow(first);
  const styles = [];
  for (let c = 1; c <= sheet.columnCount; c += 1) styles[c] = { style: sample.getCell(c).style, numFmt: sample.getCell(c).numFmt };
  // Remove old sample data and formulas, including broken cached lookups.
  if (sheet.rowCount >= first) sheet.spliceRows(first, sheet.rowCount - first + 1);
  const ordered = [...reports].sort((a,b) => String(a.work_date || '').localeCompare(String(b.work_date || '')) || String(a.worker_code || '').localeCompare(String(b.worker_code || '')));
  let previousDate = '', seq = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    const report = ordered[i], row = sheet.getRow(first + i);
    for (let c = 1; c < styles.length; c += 1) if (styles[c]) row.getCell(c).style = JSON.parse(JSON.stringify(styles[c].style || {}));
    const day = String(report.work_date || '').slice(0,10);
    seq = day === previousDate ? seq + 1 : 1; previousDate = day;
    const put = (field, value) => { if (columns[field]) row.getCell(columns[field]).value = value ?? null; };
    const gross = num(report.total_time), net = num(report.actual_time ?? report.total_time);
    const output = num(report.actual_output), ok = num(report.tt_ok ?? output), ng = num(report.tt_ng);
    const standard = num(report.standard_output), target = standard * net;
    put('seq', seq); put('submitted', date(report.created_at || report.submitted_at));
    put('worker', report.worker_code); put('name', report.full_name || report.worker_name);
    put('training', report.training_percent); put('machine', report.machine_no);
    put('shift', report.shift); put('gross', gross); put('net', net); put('deducted', Math.max(0, gross - net));
    put('product', report.product_code || report.product_name);
    put('standard', standard); put('output', output);
    put('rate', target > 0 ? output / target : 0); put('date', date(report.work_date));
    put('perHour', net > 0 ? output / net : 0);
    put('ok', ok); put('ng', ng); put('ngRate', output > 0 ? ng / output : 0);
    fillDetails(row, header, report, 1, sheet.columnCount);
    row.commit();
  }
  stripExternalLinks(workbook);
  workbook.calculation = { fullCalcOnLoad: true, forceFullCalc: true, calcMode: 'auto' };
  const [year, month] = String(yearMonth).split('-');
  const folder = path.join(options.exportRoot || path.join(process.cwd(), 'exports-process'), year, options.processName || processCode, month);
  await fs.mkdir(folder, { recursive: true });
  const fileName = options.fileName || `Bao-cao-${processCode}-${month}-${year}.xlsx`;
  const outputPath = path.join(folder, fileName);
  await workbook.xlsx.writeFile(outputPath);
  return { archivePath: outputPath, fileName, processCode, templateFile: 'Workbook1.xlsx', templateSheet: sheetName, templateHeaderRow: HEADER_ROW[processCode], dataStartRow: first, reportCount: reports.length, rowCount: ordered.length, removedBrokenFormulas: 0 };
}
module.exports = { buildSixProcessWorkbook, SHEETS, COLUMNS };
