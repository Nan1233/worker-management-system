'use strict';

// GC export uses the real one-sheet company template and injects approved DB data
// into its existing formatted rows. It deliberately skips the old shared-formula
// materialization pass because that scanned ~1.3M template cells before export.
const Module = require('node:module');
const fs = require('node:fs/promises');
const path = require('node:path');
const ExcelJS = require('exceljs');

const originalLoad = Module._load;
let patched = false;

const TEMPLATE_NAME = 'bao-cao-cat-long-export.xlsx';
const SHEET_NAME = 'Cắt lồng';
const FIRST_ANCHOR_ROW = 5;
const DAY_BLOCK_SIZE = 191;
const DATA_OFFSET = 2;
const DATA_CAPACITY = 188;
const LAST_DATA_COLUMN = 54;

const DEDUCTION_COLUMNS = Object.freeze({
  THIEU_SP: 11, BAT_MAY: 12, CHUYEN_MA: 13, CHINH_MAY: 14,
  CHO_CHINH_MAY: 15, MAT_DIEN: 16, MAT_KHI: 17, CHO_HANG: 18,
  BAO_DUONG: 19, NGHI_GIAI_LAO: 20, GIAO_CA: 21, HO_TRO: 22,
  GIAT_CAN_TUOT: 23, '5S': 24, HOC_VIEC: 25, DI_MUON_VE_SOM: 26
});

const DEFECT_COLUMNS = Object.freeze({
  KQD: 36, VO_CAO_SU: 37, K_XUOC_CONG_GAY: 38, CAO_SU_XOAY: 39,
  CAT_KHONG_DUT: 40, BAVIA: 41, CSH: 42, PPCM: 43, KT_LON: 44,
  KT_NHO: 45, LCS: 46, CAT_LEM: 47, RACH_NVL: 48, CHAN_NGAN_DAI: 49,
  SOT_VIA: 50, FURE_TRUC: 51, LAN_CS: 52, BAVIA_CAT_HUT: 53, THIEU_CAO_SU: 54
});

function now() { return Number(process.hrtime.bigint()) / 1e6; }
function text(value) { return value === null || value === undefined ? '' : String(value); }
function num(value) {
  const n = Number(text(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}
function normalizeCode(value) {
  return text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '').toUpperCase();
}
function dateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function excelDate(value) {
  const key = dateKey(value);
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}
function getMachineText(report) {
  const direct = text(report.machine_no || report.machine_code).trim();
  const lines = Array.isArray(report.machine_lines) ? report.machine_lines
    : Array.isArray(report.machines) ? report.machines : [];
  const codes = lines.map((x) => text(x?.machine_no || x?.machine_code || x?.code).trim()).filter(Boolean);
  return [...new Set([direct, ...codes].filter(Boolean))].join(', ');
}
function sumDetails(items, key) { return (items || []).reduce((sum, item) => sum + num(item?.[key]), 0); }
function metrics(report) {
  const ok = num(report.tt_ok ?? report.ok_quantity ?? report.ok);
  const totalNg = sumDetails(report.defects, 'quantity');
  const actualTime = num(report.actual_time ?? report.working_time ?? report.work_time);
  const totalTime = num(report.total_time) || actualTime + sumDetails(report.deductions, 'hours');
  const training = Math.min(100, Math.max(0, num(report.training_percent ?? 100)));
  const standard = num(report.standard_output ?? report.standard_output_per_hour ?? report.standard);
  const countedNg = (report.defects || []).reduce((sum, item) => {
    if (normalizeCode(item.defect_code || item.code || item.defect_name) === 'KQD' && Number(report.exclude_kqd_from_tt || 0) === 1) return sum;
    return sum + num(item.quantity);
  }, 0);
  const actualOutput = report.actual_output === null || report.actual_output === undefined || text(report.actual_output).trim() === ''
    ? ok + countedNg : num(report.actual_output);
  const outputPerHour = actualTime > 0 ? actualOutput / actualTime : 0;
  const achievement = standard > 0 ? outputPerHour / standard : 0;
  const ngRate = ok + totalNg > 0 ? totalNg / (ok + totalNg) : 0;
  const deductionTotal = sumDetails(report.deductions, 'hours');
  const changeCount = (report.deductions || []).filter((item) =>
    normalizeCode(item.deduction_code || item.code || item.deduction_name) === 'CHUYEN_MA' && num(item.hours) > 0
  ).length;
  return { ok, totalNg, actualTime, totalTime, training, standard, actualOutput, outputPerHour, achievement, ngRate, deductionTotal, changeCount };
}
function validReport(report) {
  return Boolean(report && text(report.worker_code).trim() && text(report.product_code || report.product_name).trim() && dateKey(report.work_date));
}
function sortedReports(reports) {
  return [...(reports || [])].filter(validReport).sort((a, b) =>
    dateKey(a.work_date).localeCompare(dateKey(b.work_date)) ||
    text(a.approved_at || a.created_at || a.entry_date || a.work_date).localeCompare(text(b.approved_at || b.created_at || b.entry_date || b.work_date)) ||
    text(a.worker_code).localeCompare(text(b.worker_code), undefined, { numeric: true }) ||
    text(a.machine_no).localeCompare(text(b.machine_no), undefined, { numeric: true }) ||
    Number(a.id || 0) - Number(b.id || 0)
  );
}
function setCell(row, column, value, format) {
  const cell = row.getCell(column);
  cell.value = value === undefined ? null : value;
  if (format) cell.numFmt = format;
}
function clearDataRow(row) {
  for (let column = 1; column <= LAST_DATA_COLUMN; column += 1) row.getCell(column).value = null;
}
function writeDetails(row, report) {
  const deductions = new Map();
  for (const item of report.deductions || []) {
    const column = DEDUCTION_COLUMNS[normalizeCode(item.deduction_code || item.code || item.deduction_name)];
    if (column) deductions.set(column, (deductions.get(column) || 0) + num(item.hours));
  }
  for (const [column, value] of deductions) setCell(row, column, value, '0.00');

  const defects = new Map();
  for (const item of report.defects || []) {
    const column = DEFECT_COLUMNS[normalizeCode(item.defect_code || item.code || item.defect_name)];
    if (column) defects.set(column, (defects.get(column) || 0) + num(item.quantity));
  }
  for (const [column, value] of defects) setCell(row, column, value, '#,##0');
}
function writeReport(row, report, sequence) {
  const m = metrics(report);
  clearDataRow(row);
  row.hidden = false;
  setCell(row, 1, sequence, '0');
  setCell(row, 2, text(report.worker_code));
  setCell(row, 3, text(report.full_name || report.worker_name || report.worker_full_name || report.user_full_name));
  setCell(row, 4, getMachineText(report));
  setCell(row, 5, text(report.shift).toUpperCase());
  setCell(row, 6, m.training / 100, '0%');
  setCell(row, 7, m.totalTime, '0.00');
  setCell(row, 8, m.actualTime, '0.00');
  setCell(row, 9, m.changeCount, '0');
  setCell(row, 10, m.deductionTotal, '0.00');
  writeDetails(row, report);
  setCell(row, 27, text(report.product_code || report.product_name));
  setCell(row, 28, m.standard, '#,##0.00');
  setCell(row, 29, m.actualOutput, '#,##0');
  setCell(row, 30, m.achievement, '0.00%');
  setCell(row, 31, excelDate(report.work_date), 'dd/mm/yyyy');
  setCell(row, 32, m.outputPerHour, '#,##0.00');
  setCell(row, 33, m.ok, '#,##0');
  setCell(row, 34, m.totalNg, '#,##0');
  setCell(row, 35, m.ngRate, '0.00%');
}
function diag(message, data = {}) {
  try {
    const m = process.memoryUsage();
    console.log('[KTC-EXCEL-TEMPLATE]', message, JSON.stringify({
      elapsedMs: Math.round(now()),
      rssMB: Math.round(m.rss / 1048576),
      heapMB: Math.round(m.heapUsed / 1048576),
      ...data
    }));
  } catch (_) {}
}

async function buildGcFromTemplate(args) {
  const started = now();
  const reports = sortedReports(args?.payload?.processes?.GC?.reports || []);
  const templatePath = path.join(args.appPath, 'assets', 'templates', TEMPLATE_NAME);
  diag('BUILD_START', { date: args.date, reportCount: reports.length, templatePath });

  const templateBuffer = await fs.readFile(templatePath);
  diag('TEMPLATE_READ_DONE', { ms: Math.round(now() - started), bytes: templateBuffer.length });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  diag('TEMPLATE_LOAD_DONE', {
    ms: Math.round(now() - started),
    sheetCount: workbook.worksheets.length,
    sheets: workbook.worksheets.map((sheet) => ({ name: sheet.name, rows: sheet.rowCount, cols: sheet.columnCount }))
  });

  const target = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!target) throw new Error('Template không có sheet Cắt lồng.');

  // Contract: one output sheet only. Do not create hidden metadata sheets.
  for (const sheet of [...workbook.worksheets]) {
    if (sheet.id !== target.id) workbook.removeWorksheet(sheet.id);
  }

  const byDay = new Map();
  for (const report of reports) {
    const day = Number(dateKey(report.work_date).slice(8, 10));
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(report);
  }

  const injectStart = now();
  for (let day = 1; day <= 31; day += 1) {
    const anchor = FIRST_ANCHOR_ROW + (day - 1) * DAY_BLOCK_SIZE;
    const start = anchor + DATA_OFFSET;
    const end = start + DATA_CAPACITY - 1;
    const dayReports = byDay.get(day) || [];
    if (dayReports.length > DATA_CAPACITY) {
      throw new Error(`Ngày ${day} có ${dayReports.length} báo cáo, vượt sức chứa ${DATA_CAPACITY} dòng của template Cắt lồng.`);
    }

    const anchorRow = target.getRow(anchor);
    anchorRow.getCell(1).value = dayReports.length ? excelDate(`${String(args.date).slice(0, 7)}-${String(day).padStart(2, '0')}`) : null;
    anchorRow.getCell(1).numFmt = 'dd/mm/yyyy';

    for (let rowNumber = start; rowNumber <= end; rowNumber += 1) {
      const row = target.getRow(rowNumber);
      clearDataRow(row);
      row.hidden = rowNumber >= start + dayReports.length;
    }
    dayReports.forEach((report, index) => writeReport(target.getRow(start + index), report, index + 1));
  }
  diag('DATA_INJECT_DONE', { ms: Math.round(now() - injectStart), reportCount: reports.length });

  // DB values are authoritative. Do not force Excel to recalculate the template's
  // legacy external formulas when the file opens.
  workbook.calcProperties.fullCalcOnLoad = false;
  workbook.calcProperties.forceFullCalc = false;
  workbook.calcProperties.calcMode = 'auto';

  const writeStart = now();
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  diag('WRITE_BUFFER_DONE', { ms: Math.round(now() - writeStart), totalMs: Math.round(now() - started), bytes: buffer.length });

  return {
    buffer,
    result: { code: 'GC', sheet: target.name, reportCount: reports.length },
    processCode: 'GC',
    processName: 'CẮT/LỒNG',
    fileName: `04_CAT_LONG_${String(args.date).slice(5, 7)}-${String(args.date).slice(0, 4)}.xlsx`,
    reportCount: reports.length,
    formulaReplacementCount: 0,
    templateKind: 'ONE_SHEET_TEMPLATE_INJECT'
  };
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcV3MonthlyPatched) return mod;
  const originalProcess = mod.buildProcessWorkbookLocal;
  if (typeof originalProcess !== 'function') {
    diag('PATCH_FAILED', { reason: 'buildProcessWorkbookLocal_missing' });
    return mod;
  }

  mod.buildProcessWorkbookLocal = async (args = {}) => {
    const code = String(args.processCode || '').trim().toUpperCase();
    if (code === 'GC') return buildGcFromTemplate(args);
    return originalProcess(args);
  };

  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const processes = [];
    for (const [code, data] of Object.entries(args?.payload?.processes || {})) {
      if (!Array.isArray(data?.reports) || data.reports.length === 0) continue;
      processes.push(await mod.buildProcessWorkbookLocal({ ...args, processCode: code }));
    }
    return { summary: null, processes };
  };

  Object.defineProperty(mod, '__ktcV3MonthlyPatched', { value: true });
  diag('MONTHLY_PATCH_INSTALLED_V3');
  return mod;
}

Module._load = function ktcTemplatePatch(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) return patchMonthly(loaded);
  return loaded;
};

diag('EXCEL_EXPORT_V3_READY');
