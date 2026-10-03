'use strict';

const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const monthly = require('./monthlyWorkbookLocal.cjs');

const COL = Object.freeze({
  SEQ: 1, WORKER_CODE: 2, WORKER_NAME: 3, MACHINE: 4, SHIFT: 5, TRAINING: 6,
  TOTAL_TIME: 7, ACTUAL_TIME: 8, CHANGE_COUNT: 9, DEDUCTION_TOTAL: 10,
  DEDUCTION_FIRST: 11, DEDUCTION_LAST: 26,
  PRODUCT: 27, STANDARD: 28, ACTUAL: 29, DATE: 30, OK: 31, ACHIEVEMENT: 32,
  OUTPUT_PER_HOUR: 33, NG: 34, DEFECT_FIRST: 35, DEFECT_LAST: 49
});

const norm = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
  .replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
const num = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};
const text = (value) => String(value ?? '').trim();

function detailValue(item, kind) {
  const value = kind === 'deduction'
    ? (item?.hours ?? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.value)
    : (item?.quantity ?? item?.defect_quantity ?? item?.ng_quantity ?? item?.qty ?? item?.count ?? item?.value);
  return num(value);
}

function detailArray(report, kind) {
  const names = kind === 'deduction'
    ? ['deductions', 'deductionDetails', 'deduction_details', 'deductionRows', 'deduction_rows']
    : ['defects', 'defectDetails', 'defect_details', 'defectRows', 'defect_rows'];
  for (const name of names) if (Array.isArray(report?.[name])) return report[name];
  return [];
}

function typeKeys(type, kind) {
  return (kind === 'deduction'
    ? [type?.id, type?.code, type?.deduction_code, type?.name, type?.deduction_name]
    : [type?.id, type?.code, type?.defect_code, type?.name, type?.defect_name])
    .filter((v) => v !== null && v !== undefined && text(v) !== '')
    .map(norm);
}

function itemKeys(item, kind) {
  return (kind === 'deduction'
    ? [item?.deduction_type_id, item?.deduction_type_code, item?.deduction_code,
       item?.deduction_type_name, item?.deduction_name, item?.type_code, item?.type_name,
       item?.code, item?.name]
    : [item?.defect_type_id, item?.defect_type_code, item?.defect_code,
       item?.defect_type_name, item?.defect_name, item?.type_code, item?.type_name,
       item?.code, item?.name])
    .filter((v) => v !== null && v !== undefined && text(v) !== '')
    .map(norm);
}

function sortedTypes(processData, kind) {
  const list = kind === 'deduction' ? processData?.deductionTypes : processData?.defectTypes;
  return (Array.isArray(list) ? [...list] : []).sort((a, b) => {
    const ao = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
    const bo = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
    return ao - bo || Number(a?.id || 0) - Number(b?.id || 0);
  });
}

function resolveTypeIndex(types, item, kind) {
  const id = kind === 'deduction' ? item?.deduction_type_id : item?.defect_type_id;
  if (id !== null && id !== undefined && text(id) !== '') {
    const byId = types.findIndex((type) => String(type?.id) === String(id));
    if (byId >= 0) return byId;
  }
  const keys = itemKeys(item, kind);
  return types.findIndex((type) => {
    const keysForType = typeKeys(type, kind);
    return keys.some((key) => keysForType.includes(key));
  });
}

function reportDate(report) {
  const value = text(report?.work_date || report?.date || report?.report_date);
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function copyRowStyle(source, target) {
  target.height = source.height;
  target.hidden = source.hidden;
  for (let c = 1; c <= COL.DEFECT_LAST; c += 1) {
    const s = source.getCell(c);
    const t = target.getCell(c);
    if (s.font) t.font = { ...s.font, color: s.font.color ? { ...s.font.color } : undefined };
    if (s.fill) t.fill = JSON.parse(JSON.stringify(s.fill));
    if (s.border) t.border = JSON.parse(JSON.stringify(s.border));
    if (s.alignment) t.alignment = { ...s.alignment };
    if (s.protection) t.protection = { ...s.protection };
    if (s.numFmt) t.numFmt = s.numFmt;
  }
}

function setHeader(sheet, column, value) {
  const cell = sheet.getCell(4, column);
  cell.value = value || '';
}

function setValue(row, column, value, numFmt) {
  const cell = row.getCell(column);
  cell.value = value ?? '';
  if (numFmt) cell.numFmt = numFmt;
}

function machineText(report) {
  const values = [report?.machine_no, report?.machine_code];
  for (const listName of ['machine_lines', 'machines', 'machine_details']) {
    if (!Array.isArray(report?.[listName])) continue;
    values.push(...report[listName].map((item) => item?.machine_no || item?.machine_code || item?.code));
  }
  return [...new Set(values.map(text).filter(Boolean))].join(', ');
}

function metrics(report) {
  const ok = num(report?.tt_ok ?? report?.ok_quantity ?? report?.ok);
  const defects = detailArray(report, 'defect');
  const detailNg = defects.reduce((sum, item) => sum + detailValue(item, 'defect'), 0);
  const actualTime = num(report?.actual_time ?? report?.working_time ?? report?.work_time);
  const deductionDetails = detailArray(report, 'deduction');
  const deductionDetailTotal = deductionDetails.reduce((sum, item) => sum + detailValue(item, 'deduction'), 0);
  const totalTime = num(report?.total_time) || actualTime + deductionDetailTotal;
  const trainingRaw = report?.training_percent === null || report?.training_percent === undefined || text(report?.training_percent) === ''
    ? 100 : num(report.training_percent);
  const training = Math.max(0, Math.min(100, trainingRaw));
  const standardRate = num(report?.standard_output ?? report?.standard_output_per_hour ?? report?.standard);
  const actualExplicit = report?.actual_output !== null && report?.actual_output !== undefined && text(report?.actual_output) !== '';
  const actual = actualExplicit ? num(report.actual_output) : ok + detailNg;
  const outputPerHour = actualTime > 0 ? actual / actualTime : 0;
  const planned = standardRate > 0 ? standardRate * actualTime * (training / 100) : 0;
  const achievement = planned > 0 ? actual / planned : (standardRate > 0 ? outputPerHour / standardRate : 0);
  const deductionTotal = num(report?.deduction_time ?? report?.total_deduction_hours ?? deductionDetailTotal);
  const changeCount = deductionDetails.filter((item) => norm(item?.deduction_code || item?.code || item?.deduction_name) === 'CHUYEN_MA' && detailValue(item, 'deduction') > 0).length;
  return { ok, detailNg, actualTime, totalTime, training, standardRate, actual, outputPerHour, planned, achievement, deductionTotal, changeCount };
}

function clearDataRows(sheet) {
  for (let r = 5; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= COL.DEFECT_LAST; c += 1) row.getCell(c).value = null;
    row.hidden = false;
  }
}

function ensureRows(sheet, count) {
  const firstDataRow = 5;
  const existing = Math.max(0, sheet.rowCount - firstDataRow + 1);
  if (existing >= count) return;
  const source = sheet.getRow(firstDataRow);
  for (let i = existing; i < count; i += 1) {
    const row = sheet.addRow([]);
    copyRowStyle(source, row);
  }
}

function reportsFromPayload(payload) {
  const reports = Array.isArray(payload?.processes?.GC?.reports) ? [...payload.processes.GC.reports] : [];
  return reports.filter((report) => text(report?.worker_code) && text(report?.work_date))
    .sort((a, b) => text(a.work_date).localeCompare(text(b.work_date))
      || text(a.approved_at || a.created_at || a.entry_date).localeCompare(text(b.approved_at || b.created_at || b.entry_date))
      || text(a.worker_code).localeCompare(text(b.worker_code), undefined, { numeric: true })
      || text(a.machine_no).localeCompare(text(b.machine_no), undefined, { numeric: true })
      || Number(a?.id || 0) - Number(b?.id || 0));
}

async function buildCompactGc({ appPath, date, payload }) {
  const templatePath = path.join(appPath, 'assets', 'templates', 'bao-cao-cat-long-export.xlsx');
  if (!fs.existsSync(templatePath)) throw new Error(`Không tìm thấy template compact Cắt Lồng: ${templatePath}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  while (workbook.worksheets.length > 1) workbook.removeWorksheet(workbook.worksheets[workbook.worksheets.length - 1].id);
  const sheet = workbook.worksheets[0];
  sheet.name = 'Báo cáo sản xuất';

  const processData = payload?.processes?.GC || {};
  const deductionTypes = sortedTypes(processData, 'deduction').slice(0, COL.DEDUCTION_LAST - COL.DEDUCTION_FIRST + 1);
  const defectTypes = sortedTypes(processData, 'defect').slice(0, COL.DEFECT_LAST - COL.DEFECT_FIRST + 1);
  for (let i = 0; i < deductionTypes.length; i += 1) setHeader(sheet, COL.DEDUCTION_FIRST + i, text(deductionTypes[i]?.name || deductionTypes[i]?.deduction_name || deductionTypes[i]?.code || `Trừ ${i + 1}`));
  for (let i = deductionTypes.length; i < COL.DEDUCTION_LAST - COL.DEDUCTION_FIRST + 1; i += 1) setHeader(sheet, COL.DEDUCTION_FIRST + i, '');
  for (let i = 0; i < defectTypes.length; i += 1) setHeader(sheet, COL.DEFECT_FIRST + i, text(defectTypes[i]?.name || defectTypes[i]?.defect_name || defectTypes[i]?.code || `NG ${i + 1}`));
  for (let i = defectTypes.length; i < COL.DEFECT_LAST - COL.DEFECT_FIRST + 1; i += 1) setHeader(sheet, COL.DEFECT_FIRST + i, '');

  const [year, month] = text(date).split('-');
  sheet.getCell('B2').value = `${month}/${year}`;
  const reports = reportsFromPayload(payload);
  clearDataRows(sheet);
  ensureRows(sheet, reports.length);

  let unmatchedDeduction = 0;
  let unmatchedDefect = 0;
  let detailDeduction = 0;
  let detailNg = 0;

  reports.forEach((report, index) => {
    const row = sheet.getRow(5 + index);
    const m = metrics(report);
    setValue(row, COL.SEQ, index + 1, '0');
    setValue(row, COL.WORKER_CODE, text(report.worker_code));
    setValue(row, COL.WORKER_NAME, text(report.full_name || report.worker_name || report.worker_full_name || report.user_full_name));
    setValue(row, COL.MACHINE, machineText(report));
    setValue(row, COL.SHIFT, text(report.shift).toUpperCase());
    setValue(row, COL.TRAINING, m.training / 100, '0%');
    setValue(row, COL.TOTAL_TIME, m.totalTime, '0.00');
    setValue(row, COL.ACTUAL_TIME, m.actualTime, '0.00');
    setValue(row, COL.CHANGE_COUNT, m.changeCount, '0');
    setValue(row, COL.DEDUCTION_TOTAL, m.deductionTotal, '0.00');

    const deductions = detailArray(report, 'deduction');
    const defects = detailArray(report, 'defect');
    for (const item of deductions) {
      const value = detailValue(item, 'deduction');
      const idx = resolveTypeIndex(deductionTypes, item, 'deduction');
      if (idx < 0 || idx >= deductionTypes.length) { if (value) unmatchedDeduction += value; continue; }
      const col = COL.DEDUCTION_FIRST + idx;
      setValue(row, col, num(row.getCell(col).value) + value, '0.00');
      detailDeduction += value;
    }
    for (const item of defects) {
      const value = detailValue(item, 'defect');
      const idx = resolveTypeIndex(defectTypes, item, 'defect');
      if (idx < 0 || idx >= defectTypes.length) { if (value) unmatchedDefect += value; continue; }
      const col = COL.DEFECT_FIRST + idx;
      setValue(row, col, num(row.getCell(col).value) + value, '#,##0');
      detailNg += value;
    }

    setValue(row, COL.PRODUCT, text(report.product_code || report.product_name));
    setValue(row, COL.STANDARD, m.planned, '#,##0.00');
    setValue(row, COL.ACTUAL, m.actual, '#,##0');
    const d = reportDate(report);
    setValue(row, COL.DATE, d, 'dd/mm/yyyy');
    setValue(row, COL.OK, m.ok, '#,##0');
    setValue(row, COL.ACHIEVEMENT, m.achievement, '0.00%');
    setValue(row, COL.OUTPUT_PER_HOUR, m.outputPerHour, '#,##0.00');
    setValue(row, COL.NG, num(report?.tt_ng ?? m.detailNg), '#,##0');
  });

  const lastRow = Math.max(4, 4 + reports.length);
  try { sheet.pageSetup.printArea = `A1:AW${lastRow}`; } catch (_) {}
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;
  sheet.pageSetup.orientation = 'landscape';
  sheet.pageSetup.paperSize = 9;
  sheet.views = [{ state: 'normal', showGridLines: false }];

  console.log('[KTC-EXCEL-COMPACT] GC_TEMPLATE_DB_DIRECT', JSON.stringify({
    reports: reports.length,
    deductionTypes: deductionTypes.length,
    defectTypes: defectTypes.length,
    detailDeduction,
    detailNg,
    unmatchedDeduction,
    unmatchedDefect,
    dbDeductionTotal: reports.reduce((sum, r) => sum + num(r?.deduction_time), 0),
    dbNgTotal: reports.reduce((sum, r) => sum + num(r?.tt_ng), 0),
    firstDate: reports[0]?.work_date || null,
    lastDate: reports[reports.length - 1]?.work_date || null
  }));

  return {
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    fileName: `Bao-cao-Gia-cong-${month}-${year}.xlsx`,
    processCode: 'GC',
    processName: 'Gia công',
    reportGroup: 'GC',
    reportCount: reports.length,
    localBuild: true,
    sourcePath: templatePath,
    templateKind: 'COMPACT_WORKER_PRODUCTION',
    targetSheets: ['Báo cáo sản xuất'],
    requestedYearMonth: `${year}-${month}`
  };
}

const originalSplit = monthly.buildSplitMonthlyWorkbooksLocal;
monthly.buildProcessWorkbookLocal = buildCompactGc;
monthly.buildSplitMonthlyWorkbooksLocal = async (args) => {
  const result = typeof originalSplit === 'function' ? await originalSplit(args) : { processes: [] };
  if (Array.isArray(result?.processes)) {
    for (const item of result.processes) {
      if (String(item?.processCode || '').toUpperCase() !== 'GC') continue;
      const compact = await buildCompactGc({
        appPath: args?.appPath || path.resolve(__dirname, '..'),
        date: args?.date,
        payload: args?.payload
      });
      Object.assign(item, compact);
    }
  }
  return result;
};

module.exports = monthly;
