'use strict';

const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');

const TEMPLATE_NAME = 'Mau_Bao_Cao_Cong_Nhan_DB_day_du_chi_tiet_STT_FIX.xlsx';
const PROCESS_FILE_PREFIXES = Object.freeze({
  CAN: '01_CAN', EP: '02_EP', XLBV: '03_XU_LY_BAVIA', GC: '04_CAT_LONG',
  MAI: '05_MAI', DO: '06_DO', K1: '07_KIEM_1', K2: '08_KIEM_2', SX3: '09_SAN_XUAT_3'
});

const normalize = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();

const number = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

function templateCandidates(appPath) {
  return [
    path.resolve(appPath || process.cwd(), '..', 'backend', 'templates', TEMPLATE_NAME),
    path.resolve(appPath || process.cwd(), 'backend', 'templates', TEMPLATE_NAME),
    path.resolve(__dirname, '..', '..', 'backend', 'templates', TEMPLATE_NAME),
    path.resolve(process.cwd(), 'backend', 'templates', TEMPLATE_NAME)
  ];
}

async function resolveTemplatePath(appPath) {
  for (const candidate of templateCandidates(appPath)) {
    try { await fs.access(candidate); return candidate; } catch (_) {}
  }
  throw Object.assign(new Error(`Không tìm thấy template ${TEMPLATE_NAME}`), { code: 'KTC_WORKER_TEMPLATE_MISSING' });
}

function cellText(cell) {
  const value = cell?.value;
  if (value && typeof value === 'object' && value.result != null) return String(value.result);
  return String(value ?? '');
}

function findHeader(sheet) {
  let best = null;
  const maxRows = Math.min(sheet.rowCount, 80);
  for (let r = 1; r <= maxRows; r += 1) {
    const labels = [];
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const text = normalize(cellText(sheet.getRow(r).getCell(c)));
      if (text) labels.push({ c, text });
    }
    const score = labels.reduce((sum, item) => {
      const t = item.text;
      return sum
        + (t === 'stt' ? 5 : 0)
        + (/^ngay( san xuat| lam viec)?$/.test(t) || t.includes('ngay')) * 2
        + (t.includes('ma nv') || t.includes('ma nhan vien') || t.includes('ma so') ? 3 : 0)
        + (t.includes('ho ten') || t === 'ten' ? 3 : 0)
        + (t === 'ca' ? 2 : 0)
        + (t.includes('may') ? 2 : 0)
        + (t.includes('thoi gian') ? 2 : 0);
    }, 0);
    if (!best || score > best.score) best = { row: r, labels, score };
  }
  if (!best || best.score < 7) throw Object.assign(new Error('Không nhận diện được hàng tiêu đề của template công nhân'), { code: 'KTC_WORKER_TEMPLATE_HEADER_NOT_FOUND' });
  return best.row;
}

function findColumnMap(sheet, headerRow) {
  const map = new Map();
  for (let c = 1; c <= sheet.columnCount; c += 1) {
    const label = normalize(cellText(sheet.getRow(headerRow).getCell(c)));
    if (label) map.set(c, label);
  }
  return map;
}

function findColumn(map, predicates) {
  for (const [column, label] of map.entries()) if (predicates.every((p) => p(label))) return column;
  return null;
}

function pick(map, ...terms) {
  return findColumn(map, terms.map((term) => (label) => label.includes(normalize(term))));
}

function detailColumn(map, label) {
  const target = normalize(label);
  if (!target) return null;
  let best = null;
  for (const [column, header] of map.entries()) {
    if (header === target || header.includes(target) || target.includes(header)) {
      const score = header === target ? 100 : Math.min(header.length, target.length);
      if (!best || score > best.score) best = { column, score };
    }
  }
  return best?.column || null;
}

function copyStyle(source, target) {
  if (!source || !target) return;
  if (source.font) target.font = JSON.parse(JSON.stringify(source.font));
  if (source.fill) target.fill = JSON.parse(JSON.stringify(source.fill));
  if (source.border) target.border = JSON.parse(JSON.stringify(source.border));
  if (source.alignment) target.alignment = JSON.parse(JSON.stringify(source.alignment));
  if (source.protection) target.protection = JSON.parse(JSON.stringify(source.protection));
  if (source.numFmt) target.numFmt = source.numFmt;
}

function cloneRowStyle(sheet, sourceRow, targetRow) {
  targetRow.height = sourceRow.height;
  for (let c = 1; c <= Math.max(sheet.columnCount, sourceRow.cellCount); c += 1) copyStyle(sourceRow.getCell(c), targetRow.getCell(c));
}

function findDataStartRow(sheet, headerRow) {
  for (let r = headerRow + 1; r <= Math.min(sheet.rowCount, headerRow + 20); r += 1) {
    const row = sheet.getRow(r);
    const nonEmpty = [];
    for (let c = 1; c <= sheet.columnCount; c += 1) if (cellText(row.getCell(c)).trim()) nonEmpty.push(c);
    if (!nonEmpty.length) return r;
    const first = normalize(cellText(row.getCell(1)));
    if (first === '1' || first === 'stt') return r;
  }
  return headerRow + 1;
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseExtra(report) {
  if (!report?.extra_data) return {};
  if (typeof report.extra_data === 'object' && !Array.isArray(report.extra_data)) return report.extra_data;
  try { const parsed = JSON.parse(String(report.extra_data)); return parsed && typeof parsed === 'object' ? parsed : {}; } catch (_) { return {}; }
}

function detailItems(report, kind) {
  const keys = kind === 'deduction'
    ? ['deductions', 'deductionDetails', 'deduction_details', 'deductionRows', 'deduction_rows']
    : ['defects', 'defectDetails', 'defect_details', 'defectRows', 'defect_rows'];
  for (const key of keys) if (Array.isArray(report?.[key])) return report[key];
  return [];
}

function detailLabel(item, kind) {
  return kind === 'deduction'
    ? (item?.deduction_name || item?.name || item?.deduction_code || item?.code || '')
    : (item?.defect_name || item?.name || item?.defect_code || item?.code || '');
}

function detailValue(item, kind) {
  return kind === 'deduction'
    ? number(item?.hours ?? item?.deduction_hours ?? item?.duration_hours ?? item?.time_hours ?? item?.value)
    : number(item?.quantity ?? item?.defect_quantity ?? item?.ng_quantity ?? item?.qty ?? item?.value);
}

function processTypes(processData, kind) {
  const key = kind === 'deduction' ? 'deductionTypes' : 'defectTypes';
  const rows = Array.isArray(processData?.[key]) ? processData[key] : [];
  return [...rows].sort((a, b) => number(a?.sort_order) - number(b?.sort_order) || number(a?.id) - number(b?.id));
}

function buildColumnContract(map, processData) {
  const cols = {
    stt: pick(map, 'stt'),
    date: pick(map, 'ngay san xuat') || pick(map, 'ngay lam viec') || pick(map, 'ngay'),
    workerCode: pick(map, 'ma nv') || pick(map, 'ma nhan vien') || pick(map, 'ma so'),
    workerName: pick(map, 'ho ten') || pick(map, 'ten nv') || pick(map, 'ten'),
    machine: pick(map, 'so may') || pick(map, 'may'),
    shift: findColumn(map, [(label) => label === 'ca' || label.startsWith('ca ')]),
    time: pick(map, 'thoi gian'),
    actualTime: pick(map, 'thoi gian thuc te'),
    deductionTotal: pick(map, 'tong thoi gian tru') || pick(map, 'tong tru') || pick(map, 'tru h'),
    ok: pick(map, 'sl ok') || pick(map, 'san pham ok') || pick(map, 'ok'),
    ng: pick(map, 'tong ng') || pick(map, 'tong loi') || pick(map, 'ng'),
    output: pick(map, 'ket qua san xuat') || pick(map, 'thuc tich') || pick(map, 'san luong') || pick(map, 'tt')
  };
  const deductions = processTypes(processData, 'deduction').map((type) => ({ type, column: detailColumn(map, type?.deduction_name || type?.name || type?.deduction_code || type?.code) })).filter((x) => x.column);
  const defects = processTypes(processData, 'defect').map((type) => ({ type, column: detailColumn(map, type?.defect_name || type?.name || type?.defect_code || type?.code) })).filter((x) => x.column);
  return { cols, deductions, defects };
}

function writeValue(row, column, value) {
  if (!column) return;
  row.getCell(column).value = value == null ? null : value;
}

function clearDataRows(sheet, startRow, count, columnCount) {
  for (let r = startRow; r < startRow + count; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= columnCount; c += 1) {
      const cell = row.getCell(c);
      if (!(typeof cell.value === 'string' && cell.value.startsWith('='))) cell.value = null;
    }
  }
}

function applyReportRow(row, report, contract, index) {
  writeValue(row, contract.cols.stt, index + 1);
  writeValue(row, contract.cols.date, asDate(report.work_date || report.entry_date));
  writeValue(row, contract.cols.workerCode, report.worker_code);
  writeValue(row, contract.cols.workerName, report.full_name || report.worker_name || report.name);
  writeValue(row, contract.cols.machine, report.machine_no ?? report.machine_code);
  writeValue(row, contract.cols.shift, report.shift);
  writeValue(row, contract.cols.time, number(report.actual_time ?? report.total_time));
  if (contract.cols.actualTime && contract.cols.actualTime !== contract.cols.time) writeValue(row, contract.cols.actualTime, number(report.actual_time ?? report.total_time));
  writeValue(row, contract.cols.deductionTotal, number(report.deduction_time));
  writeValue(row, contract.cols.ok, number(report.tt_ok ?? report.actual_output));
  writeValue(row, contract.cols.ng, number(report.tt_ng));
  writeValue(row, contract.cols.output, number(report.actual_output ?? report.tt_ok));

  for (const item of contract.deductions) {
    const wanted = normalize(item.type?.deduction_name || item.type?.name || item.type?.deduction_code || item.type?.code);
    const value = detailItems(report, 'deduction').filter((x) => normalize(detailLabel(x, 'deduction')) === wanted).reduce((sum, x) => sum + detailValue(x, 'deduction'), 0);
    writeValue(row, item.column, value);
  }
  for (const item of contract.defects) {
    const wanted = normalize(item.type?.defect_name || item.type?.name || item.type?.defect_code || item.type?.code);
    const value = detailItems(report, 'defect').filter((x) => normalize(detailLabel(x, 'defect')) === wanted).reduce((sum, x) => sum + detailValue(x, 'defect'), 0);
    writeValue(row, item.column, value);
  }
}

async function buildWorkerProcessWorkbook({ appPath, processCode, processName, date, processData = {} }) {
  const templatePath = await resolveTemplatePath(appPath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const sheet = workbook.worksheets.find((item) => item.state !== 'hidden') || workbook.worksheets[0];
  if (!sheet) throw new Error('Template công nhân không có worksheet.');

  const headerRow = findHeader(sheet);
  const columnMap = findColumnMap(sheet, headerRow);
  const contract = buildColumnContract(columnMap, processData);
  const reports = Array.isArray(processData?.reports) ? [...processData.reports] : [];
  reports.sort((a, b) => String(a?.work_date || '').localeCompare(String(b?.work_date || '')) || number(a?.id) - number(b?.id));

  const dataStartRow = findDataStartRow(sheet, headerRow);
  const sourceRow = sheet.getRow(dataStartRow);
  const requiredEndRow = dataStartRow + reports.length - 1;
  if (reports.length > 0) {
    for (let r = dataStartRow; r <= requiredEndRow; r += 1) {
      const row = sheet.getRow(r);
      if (r !== dataStartRow) cloneRowStyle(sheet, sourceRow, row);
      applyReportRow(row, reports[r - dataStartRow], contract, r - dataStartRow);
    }
  }

  const clearCount = Math.max(0, sheet.rowCount - (dataStartRow + reports.length) + 1);
  clearDataRows(sheet, dataStartRow + reports.length, clearCount, sheet.columnCount);
  workbook.calculation = { fullCalcOnLoad: true, forceFullCalc: true, calcMode: 'auto' };

  const [year, month] = String(date).slice(0, 7).split('-');
  const prefix = PROCESS_FILE_PREFIXES[String(processCode || '').toUpperCase()] || String(processCode || 'PROCESS').toUpperCase();
  const fileName = `${prefix}_${month}-${year}.xlsx`;
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    fileName,
    processCode: String(processCode || '').toUpperCase(),
    processName: processName || processCode,
    reportCount: reports.length,
    templateFile: TEMPLATE_NAME,
    templateSheet: sheet.name,
    headerRow,
    dataStartRow
  };
}

module.exports = { TEMPLATE_NAME, PROCESS_FILE_PREFIXES, buildWorkerProcessWorkbook };
