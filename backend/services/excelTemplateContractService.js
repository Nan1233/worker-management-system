'use strict';

const path = require('node:path');
const fs = require('node:fs/promises');
const ExcelJS = require('exceljs');

const TEMPLATE_CANDIDATES = [
  path.join(__dirname, '../templates/KTC-Bao-cao-9-cong-doan.xlsx'),
  path.join(__dirname, '../templates/file mẫu.xlsx'),
  path.join(__dirname, '../templates/file mß║½u.xlsx'),
  path.join(__dirname, '../templates/file m#U1eabu.xlsx')
];

const PROCESS_TEMPLATE_CONTRACTS = Object.freeze({
  CAN: { sheet: 'CÁN', headerRow: 133, dataStartRow: 134 },
  EP: { sheet: 'EP', headerRow: 140, dataStartRow: 141 },
  XLBV: { sheet: 'XLBV', headerRow: 333, dataStartRow: 334 },
  GC: { sheet: 'Cắt lồng', headerRow: 5, dataStartRow: 6 },
  MAI: { sheet: 'TT Mài', headerRow: 2, dataStartRow: 3 },
  DO: { sheet: 'TT Đo', headerRow: 2, dataStartRow: 3 },
  K1: { sheet: 'TT Kiểm 1', headerRow: 4, dataStartRow: 5 },
  K2: { sheet: 'TT Kiểm 2', headerRow: 4, dataStartRow: 5 },
  SX3: { sheet: 'sx3', headerRow: 3, dataStartRow: 4 }
});

function normalizeLabel(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[.:%()/#\\_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function resolveTemplatePath() {
  for (const candidate of TEMPLATE_CANDIDATES) {
    try { await fs.access(candidate); return candidate; } catch (_) { /* next */ }
  }
  throw new Error('Không tìm thấy file mẫu Excel KTC trong backend/templates');
}

function getProcessTemplateContract(processCode) {
  const code = String(processCode || '').trim().toUpperCase();
  const contract = PROCESS_TEMPLATE_CONTRACTS[code];
  if (!contract) {
    const error = new Error(`Chưa có contract Excel cho công đoạn ${code}`);
    error.code = 'EXCEL_TEMPLATE_PROCESS_UNSUPPORTED';
    error.statusCode = 422;
    throw error;
  }
  return { processCode: code, ...contract };
}

function buildHeaderIndex(sheet, headerRow) {
  const index = new Map();
  const row = sheet.getRow(headerRow);
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    const key = normalizeLabel(row.getCell(column).value);
    if (!key) continue;
    const list = index.get(key) || [];
    list.push(column);
    index.set(key, list);
  }
  return index;
}

function findColumn(headerIndex, aliases, used = new Set()) {
  for (const alias of aliases) {
    const key = normalizeLabel(alias);
    const candidates = headerIndex.get(key) || [];
    const free = candidates.find((column) => !used.has(column));
    if (free) return free;
  }
  for (const alias of aliases) {
    const key = normalizeLabel(alias);
    for (const [header, columns] of headerIndex.entries()) {
      if (!header.includes(key) && !key.includes(header)) continue;
      const free = columns.find((column) => !used.has(column));
      if (free) return free;
    }
  }
  return null;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function cloneStyle(source, target) {
  if (!source || !target) return;
  target.style = clone(source.style || {});
  target.font = clone(source.font || {});
  target.fill = clone(source.fill || {});
  target.border = clone(source.border || {});
  target.alignment = clone(source.alignment || {});
  target.protection = clone(source.protection || {});
  target.numFmt = source.numFmt;
}

function copyRowTemplate(sheet, sourceRowNumber, targetRowNumber) {
  if (sourceRowNumber === targetRowNumber) return;
  const source = sheet.getRow(sourceRowNumber);
  const target = sheet.getRow(targetRowNumber);
  target.height = source.height;
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    cloneStyle(source.getCell(column), target.getCell(column));
  }
}

function clearWritableCell(cell) {
  const value = cell.value;
  if (typeof value === 'string' && value.startsWith('=')) return;
  cell.value = null;
}

function toNumber(value) {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function reportNg(report) {
  return (report.defects || []).reduce((sum, item) => sum + toNumber(item.quantity), 0);
}

function reportActualOutput(report) {
  if (report.machinePerformance?.machine_count > 0) return toNumber(report.machinePerformance.counted_output);
  const saved = toNumber(report.actual_output);
  return saved || (toNumber(report.tt_ok) + reportNg(report));
}

const COMMON_ALIASES = Object.freeze({
  sequence: ['STT'],
  worker_code: ['Mã nhân viên', 'Mã số CN', 'Nhập mã số CN', 'Nhập mã số công nhân', 'Mã số công nhân'],
  full_name: ['Họ tên', 'Họ & Tên', 'Họ và tên', 'Tên', 'Người mài'],
  shift: ['Ca', 'Ca làm việc', 'Ca A/C', 'Ca sản xuất', 'Số ca'],
  machine_no: ['Số máy', 'Máy CÁN', 'Số máy cán', 'Số máy ép', 'Số máy mài', 'máy đo', 'Số máy/vị trí'],
  training_percent: ['% học việc'],
  total_time: ['Thời gian làm việc', 'Thời gian', 'Thời gian cán', 'Thời gian ép', 'Tổng thời gian'],
  actual_time: ['Thời gian làm thực tế', 'Thời gian đo thực tế', 'Thời gian ép thực tế', 'Thời gian lắp ráp thực tích'],
  deduction_time: ['Tổng TG trừ giờ', 'Tổng thời gian trừ giờ', 'Trừ giờ'],
  product_name: ['Mã SP', 'MÃ SP', 'Mã số Sản Phẩm', 'SP', 'Mã sản phẩm'],
  standard_output: ['Định mức', 'KH'],
  actual_output: ['TT', 'KQSX', 'Thực tích sản lượng', 'Thực tích', 'Kết quả sản xuất', 'Kết quả cán'],
  output_per_hour: ['SL/H', 'SLSP/h', 'NS/H', 'Năng suất/giờ', 'Năng suất/ giờ'],
  achievement_rate: ['% Năng suất', '%', '% Thực tích', '% thực tích', '% Sản lượng theo kế hoạch'],
  work_date: ['Ngày/ Tháng', 'Ngày tháng', 'Ngày sản xuất', 'NGÀY'],
  tt_ok: ['OK', 'Sản phẩm OK'],
  total_ng: ['tổng NG', 'TỔNG PP', 'tổng pp', 'Sản phẩm NG', 'Tổng lỗi'],
  ng_rate: ['% PP', '% phế phẩm', '% Sản phẩm NG/Thực tích', 'Tỷ lệ pp']
});

function writeReportToTemplateRow(sheet, rowNumber, report, headerIndex, contract) {
  const used = new Set();
  const set = (field, value, aliases = COMMON_ALIASES[field] || []) => {
    const column = findColumn(headerIndex, aliases, used);
    if (!column) return false;
    used.add(column);
    const cell = sheet.getRow(rowNumber).getCell(column);
    clearWritableCell(cell);
    cell.value = value;
    return true;
  };

  set('sequence', report.__sequence);
  set('worker_code', report.worker_code || '');
  set('full_name', report.full_name || '');
  set('shift', report.shift || '');
  set('machine_no', report.machine_no || '');
  set('training_percent', report.training_percent == null ? null : Number(report.training_percent) / 100);
  set('total_time', toNumber(report.total_time));
  set('actual_time', toNumber(report.actual_time));
  set('deduction_time', toNumber(report.deduction_time));
  set('product_name', report.product_name || '');
  set('standard_output', toNumber(report.standard_output));
  set('actual_output', reportActualOutput(report));
  set('output_per_hour', toNumber(report.actual_time) > 0 ? reportActualOutput(report) / toNumber(report.actual_time) : 0);
  set('achievement_rate', toNumber(report.standard_output) > 0 && toNumber(report.actual_time) > 0
    ? reportActualOutput(report) / toNumber(report.actual_time) / toNumber(report.standard_output)
    : 0);
  set('work_date', toDate(report.work_date));
  set('tt_ok', toNumber(report.tt_ok));
  set('total_ng', reportNg(report));
  set('ng_rate', reportActualOutput(report) > 0 ? reportNg(report) / reportActualOutput(report) : 0);

  const writeDetails = (items, valueKey, aliasesForItem) => {
    for (const item of items || []) {
      const aliases = aliasesForItem(item);
      const column = findColumn(headerIndex, aliases, used);
      if (!column) continue;
      used.add(column);
      const cell = sheet.getRow(rowNumber).getCell(column);
      clearWritableCell(cell);
      cell.value = toNumber(item[valueKey]);
    }
  };

  writeDetails(report.deductions, 'hours', (item) => [item.deduction_name, item.deduction_code, item.name, item.code]);
  writeDetails(report.defects, 'quantity', (item) => [item.defect_name, item.defect_code, item.name, item.code]);

  if (contract.processCode === 'SX3') {
    set('actual_output', reportActualOutput(report), ['Thực tích sản lượng']);
    set('actual_time', toNumber(report.assembly_minutes ?? report.actual_time), ['Thời gian lắp ráp thực tích']);
  }
}

async function buildProcessTemplateWorkbook(reports, yearMonth, options = {}) {
  const processCode = String(options.processCode || reports?.[0]?.process_code || '').toUpperCase();
  const contract = getProcessTemplateContract(processCode);
  const templatePath = await resolveTemplatePath();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const sheet = workbook.getWorksheet(contract.sheet);
  if (!sheet) throw new Error(`File mẫu không có sheet ${contract.sheet}`);

  const headerIndex = buildHeaderIndex(sheet, contract.headerRow);
  const sorted = [...(reports || [])].sort((a, b) => String(a.work_date || '').localeCompare(String(b.work_date || '')) || Number(a.id) - Number(b.id));
  const sourceRow = contract.dataStartRow;
  const endRow = Math.max(sheet.rowCount, sourceRow + sorted.length + 20);

  for (let row = sourceRow; row <= endRow; row += 1) {
    const target = sheet.getRow(row);
    for (const columns of headerIndex.values()) {
      for (const columnNumber of columns) clearWritableCell(target.getCell(columnNumber));
    }
  }

  sorted.forEach((report, index) => {
    const rowNumber = sourceRow + index;
    copyRowTemplate(sheet, sourceRow, rowNumber);
    report.__sequence = index + 1;
    writeReportToTemplateRow(sheet, rowNumber, report, headerIndex, contract);
    sheet.getRow(rowNumber).height = sheet.getRow(sourceRow).height;
  });

  sheet.views = [{
    ...(sheet.views?.[0] || {}),
    state: 'frozen',
    ySplit: Math.max(0, contract.headerRow),
    topLeftCell: `A${sourceRow}`
  }];
  sheet.autoFilter = {
    from: { row: contract.headerRow, column: 1 },
    to: { row: contract.headerRow, column: sheet.columnCount }
  };
  sheet.pageSetup = {
    ...(sheet.pageSetup || {}),
    printArea: `A1:${sheet.getColumn(sheet.columnCount).letter}${Math.max(contract.headerRow, sourceRow + sorted.length - 1)}`
  };

  const [year, month] = yearMonth.split('-');
  const exportRoot = options.exportRoot || path.join(process.cwd(), 'exports-process');
  const folder = path.join(exportRoot, year, options.stageFolder || processCode, month);
  await fs.mkdir(folder, { recursive: true });
  const safeName = String(options.processName || processCode)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || processCode;
  const fileName = `Bao-cao-${safeName}-${month}-${year}.xlsx`;
  const target = path.join(folder, fileName);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await workbook.xlsx.writeFile(temp);
  await fs.rm(target, { force: true });
  await fs.rename(temp, target);
  return { archivePath: target, fileName, reportCount: sorted.length, templatePath, templateSheet: contract.sheet, headerRow: contract.headerRow };
}

module.exports = {
  TEMPLATE_CANDIDATES,
  PROCESS_TEMPLATE_CONTRACTS,
  normalizeLabel,
  resolveTemplatePath,
  getProcessTemplateContract,
  buildHeaderIndex,
  buildProcessTemplateWorkbook
};
