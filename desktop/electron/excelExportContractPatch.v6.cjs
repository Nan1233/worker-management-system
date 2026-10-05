'use strict';

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ExcelJS = require('exceljs');
const monthly = require('./monthlyWorkbookLocal.cjs');

if (typeof global.findDataStartRow !== 'function') {
  global.findDataStartRow = function findDataStartRow(sheet, headerRow) {
    for (let r = headerRow + 1; r <= Math.min(sheet.rowCount, headerRow + 20); r += 1) {
      const row = sheet.getRow(r);
      let nonEmpty = false;
      for (let c = 1; c <= sheet.columnCount; c += 1) {
        if (String(row.getCell(c)?.value ?? '').trim()) {
          nonEmpty = true;
          break;
        }
      }
      if (!nonEmpty) return r;
      const first = String(row.getCell(1)?.value ?? '').trim().toLowerCase();
      if (first === '1' || first === 'stt') return r;
    }
    return headerRow + 1;
  };
}

if (typeof global.cloneRowStyle !== 'function') {
  global.cloneRowStyle = function cloneRowStyle(sheet, sourceRow, targetRow) {
    if (!sourceRow || !targetRow) return;
    targetRow.height = sourceRow.height;
    targetRow.hidden = sourceRow.hidden;
    targetRow.outlineLevel = sourceRow.outlineLevel;
    const maxColumns = Math.max(sheet.columnCount, sourceRow.cellCount);
    for (let c = 1; c <= maxColumns; c += 1) {
      const source = sourceRow.getCell(c);
      const target = targetRow.getCell(c);
      if (source.font) target.font = source.font;
      if (source.fill) target.fill = source.fill;
      if (source.border) target.border = source.border;
      if (source.alignment) target.alignment = source.alignment;
      if (source.protection) target.protection = source.protection;
      if (source.numFmt) target.numFmt = source.numFmt;
    }
  };
}

const { buildWorkerProcessWorkbook, PROCESS_FILE_PREFIXES } = require('./workerReportTemplateLocal.v2.cjs');
const PROCESS_CODES = Object.freeze(['CAN', 'EP', 'XLBV', 'GC', 'MAI', 'DO', 'K1', 'K2', 'SX3']);

const norm = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();

function cellText(cell) {
  const value = cell?.value;
  if (value && typeof value === 'object') {
    if (value.result != null) return String(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((x) => String(x?.text ?? '')).join('');
  }
  return String(value ?? '');
}

function combinedHeaderMap(sheet, headerRow) {
  const map = new Map();
  const start = Math.max(1, Number(headerRow || 1) - 3);
  for (let c = 1; c <= sheet.columnCount; c += 1) {
    const parts = [];
    for (let r = start; r <= headerRow; r += 1) {
      const text = norm(cellText(sheet.getRow(r).getCell(c)));
      if (text && !parts.includes(text)) parts.push(text);
    }
    if (parts.length) map.set(c, parts.join(' | '));
  }
  return map;
}

function findHeaderColumn(map, predicates) {
  for (const [column, label] of map.entries()) {
    if (predicates.every((predicate) => predicate(label))) return column;
  }
  return null;
}

function containsAny(label, terms) {
  return terms.some((term) => label.includes(norm(term)));
}

function repairWorkerRows(buffer, built, processData) {
  if (!Array.isArray(processData?.reports) || !processData.reports.length) return buffer;
  return (async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets.find((item) => item.state !== 'hidden') || workbook.worksheets[0];
    if (!sheet) return buffer;

    const headerRow = Number(built?.headerRow || 0);
    const dataStartRow = Number(built?.dataStartRow || 0);
    if (!headerRow || !dataStartRow) return buffer;

    const map = combinedHeaderMap(sheet, headerRow);
    const cols = {
      workerCode: findHeaderColumn(map, [(label) => containsAny(label, ['ma nv', 'ma nhan vien', 'ma cong nhan', 'ma cn', 'worker code'])]),
      workerName: findHeaderColumn(map, [(label) => containsAny(label, ['ho ten', 'ten nv', 'ten cong nhan', 'full name'])]),
      shift: findHeaderColumn(map, [(label) => /(^|\| )ca( |\||$)/.test(label)]),
      machine: findHeaderColumn(map, [(label) => containsAny(label, ['so may', 'ma may', 'machine']) || /(^|\| )may( |\||$)/.test(label)]),
      product: findHeaderColumn(map, [(label) => containsAny(label, ['ma sp', 'ma san pham', 'san pham', 'product'])]),
      operationType: findHeaderColumn(map, [(label) => containsAny(label, ['loai thao tac', 'operation type'])]),
      operationMode: findHeaderColumn(map, [(label) => containsAny(label, ['che do', 'operation mode'])]),
      training: findHeaderColumn(map, [(label) => containsAny(label, ['hoc viec', 'training'])]),
      standard: findHeaderColumn(map, [(label) => containsAny(label, ['dinh muc', 'standard'])]),
      totalTime: findHeaderColumn(map, [(label) => containsAny(label, ['tong thoi gian', 'thoi gian lam viec', 'thoi gian'])]),
      actualTime: findHeaderColumn(map, [(label) => containsAny(label, ['thoi gian thuc te', 'actual time'])]),
      deductionTotal: findHeaderColumn(map, [(label) => containsAny(label, ['tong thoi gian tru', 'tong tru', 'tru h'])]),
      ok: findHeaderColumn(map, [(label) => containsAny(label, ['sl ok', 'san pham ok']) || /(^|\| )ok( |\||$)/.test(label)]),
      ng: findHeaderColumn(map, [(label) => containsAny(label, ['tong ng', 'tong loi']) || /(^|\| )ng( |\||$)/.test(label)]),
      output: findHeaderColumn(map, [(label) => containsAny(label, ['ket qua san xuat', 'thuc tich', 'san luong']) || /(^|\| )tt( |\||$)/.test(label)]),
      achievement: findHeaderColumn(map, [(label) => containsAny(label, ['ty le dat', 'ty le thuc tich', 'nang suat', 'achievement'])]),
      outputPerHour: findHeaderColumn(map, [(label) => containsAny(label, ['sp gio', 'san pham gio'])]),
      ngRate: findHeaderColumn(map, [(label) => containsAny(label, ['ty le ng'])]),
      status: findHeaderColumn(map, [(label) => containsAny(label, ['trang thai', 'status'])]),
      note: findHeaderColumn(map, [(label) => containsAny(label, ['ghi chu', 'note'])])
    };

    // workerReportTemplateLocal.v2 already wrote every field it could map, and
    // owns the Trừ H / NG detail blocks. This repair pass only fills base fields
    // v2 could not map, and never writes into a detail column or a column v2
    // already used for a different field.
    const v2Contract = built?.columnContract || null;
    const v2Cols = v2Contract?.cols || {};
    const protectedColumns = new Set((v2Contract?.detailColumns || []).map(Number));
    for (const value of Object.values(v2Cols)) if (value) protectedColumns.add(Number(value));
    for (const field of Object.keys(cols)) {
      if (!v2Contract) continue;
      if (v2Cols[field] || protectedColumns.has(Number(cols[field]))) cols[field] = null;
    }

    const setIfMapped = (row, column, value) => {
      if (column && value !== undefined && value !== null && value !== '') row.getCell(column).value = value;
    };

    const reportList = [...processData.reports];
    reportList.sort((a, b) => String(a?.work_date || '').localeCompare(String(b?.work_date || '')) || Number(a?.id || 0) - Number(b?.id || 0));

    for (let i = 0; i < reportList.length; i += 1) {
      const report = reportList[i];
      const row = sheet.getRow(dataStartRow + i);
      setIfMapped(row, cols.workerCode, report.worker_code);
      setIfMapped(row, cols.workerName, report.full_name || report.worker_name || report.name);
      setIfMapped(row, cols.shift, report.shift);
      setIfMapped(row, cols.machine, report.machine_no ?? report.machine_code ?? report.machine);
      setIfMapped(row, cols.product, report.product_name || report.product_code);
      setIfMapped(row, cols.operationType, report.operation_type);
      setIfMapped(row, cols.operationMode, report.operation_mode);
      setIfMapped(row, cols.training, Number(report.training_percent ?? 0));
      setIfMapped(row, cols.standard, Number(report.standard_output ?? 0));
      setIfMapped(row, cols.totalTime, Number(report.total_time ?? report.actual_time ?? 0));
      setIfMapped(row, cols.actualTime, Number(report.actual_time ?? report.total_time ?? 0));
      setIfMapped(row, cols.deductionTotal, Number(report.deduction_time ?? 0));
      setIfMapped(row, cols.ok, Number(report.tt_ok ?? report.actual_output ?? 0));
      setIfMapped(row, cols.ng, Number(report.tt_ng ?? 0));
      setIfMapped(row, cols.output, Number(report.actual_output ?? report.tt_ok ?? 0));
      setIfMapped(row, cols.achievement, Number(report.calculationSnapshot?.achievement_rate ?? report.achievement_rate ?? 0));
      setIfMapped(row, cols.outputPerHour, Number(report.calculationSnapshot?.actual_per_hour ?? report.actual_output_per_hour ?? 0));
      setIfMapped(row, cols.ngRate, Number(report.calculationSnapshot?.ng_rate ?? report.ng_rate ?? 0));
      setIfMapped(row, cols.status, report.status);
      setIfMapped(row, cols.note, report.note || report.review_note);

      // Trừ H / NG detail columns are written by workerReportTemplateLocal.v2
      // using a range-restricted one-to-one mapping. Do not rewrite them here.
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  })();
}

function processRows(payload) {
  const processes = payload?.processes || {};
  return PROCESS_CODES.map((code) => {
    const data = processes[code] || {};
    return { processCode: code, processName: data.processName || data.process_name || code, data };
  });
}

async function buildWorkerSplit({ appPath, date, payload }) {
  const processes = [];
  for (const item of processRows(payload)) {
    let built = await buildWorkerProcessWorkbook({
      appPath,
      processCode: item.processCode,
      processName: item.processName,
      date,
      processData: item.data
    });
    if (built?.reportCount > 0) {
      built.buffer = await repairWorkerRows(built.buffer, built, item.data);
      built.repairContract = 'multi-row-header-v1';
    }
    processes.push(built);
  }
  return { mode: 'WORKER_REPORT_TEMPLATE', processes, summary: null, expectedFileCount: processes.length };
}

monthly.buildSplitMonthlyWorkbooksLocal = buildWorkerSplit;

function cleanupLegacyMonthlyFilesSource() {
  return `
async function __ktcCleanupLegacyMonthlyLayout(root, date) {
  try {
    const [year, month] = String(date).split('-');
    const monthFolder = path.join(root, year, month);
    const entries = await fs.readdir(monthFolder, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(monthFolder, entry.name);
      if (entry.isDirectory()) {
        await fs.rm(full, { recursive: true, force: true });
        continue;
      }
      if (/^00_TONG_HOP_SAN_XUAT_\\d{2}-\\d{4}\\.xlsx$/i.test(entry.name)) await fs.rm(full, { force: true });
    }
  } catch (error) {
    await writeLog('WARN', 'EXCEL_LEGACY_LAYOUT_CLEANUP_FAILED', { root, date, message: error?.message || String(error) });
  }
}
`;
}

function patchMainSource(source) {
  let next = String(source);
  if (!next.includes('const PROCESS_CODES = Object.freeze([')) {
    next = `const PROCESS_CODES = Object.freeze(['CAN', 'EP', 'XLBV', 'GC', 'MAI', 'DO', 'K1', 'K2', 'SX3']);\n${next}`;
  }
  next = next.replace(/\n\s*\/\/ File tổng hợp: 00_TONG_HOP_SAN_XUAT_MM-YYYY\.xlsx[\s\S]*?\n\s*\/\/ 9 công đoạn: giữ đúng cấu trúc file local đã được smoke-test\./, '\n\n    // 9 công đoạn: dùng cùng template báo cáo công nhân; không tạo file tổng hợp.');
  next = next.replace(/\n\s*const processFolder = path\.join\(folder, safeFolderName\(processBuilt\.processName \|\| processBuilt\.processCode\)\);\n\s*await fs\.mkdir\(processFolder, \{ recursive: true \}\);/g, '');
  next = next.replace(/path\.join\(\s*processFolder,\s*/g, 'path.join(\n        folder,\n        ');
  next = next.replace(/folder: processFolder,/g, 'folder,');
  next = next.replace(/expectedFileCount: Object\.keys\(PROCESS_SHEETS\)\.length \+ 1/g, 'expectedFileCount: PROCESS_CODES.length');
  next = next.replace(/const expectedFileCount = Object\.keys\(PROCESS_SHEETS\)\.length \+ 1;/g, 'const expectedFileCount = PROCESS_CODES.length;');
  next = next.replace(/mode: 'desktop-local-monthly-workbooks'/g, "mode: 'desktop-local-worker-template'");
  const cleanupFn = cleanupLegacyMonthlyFilesSource();
  const marker = '\nasync function syncAllProcessExcel';
  if (!next.includes('__ktcCleanupLegacyMonthlyLayout')) next = next.replace(marker, `\n${cleanupFn}${marker}`);
  next = next.replace(/\n\s*await writeLog\('INFO', 'MONTHLY_SPLIT_WORKBOOKS_UPDATED', \{/g, '\n    await writeLog(\'INFO\', \'MONTHLY_WORKER_TEMPLATE_UPDATED\', {');
  const successMarker = 'const success = files.length === expectedFileCount && files.every((file) => file.success === true);';
  if (!next.includes('if (success) await __ktcCleanupLegacyMonthlyLayout')) next = next.replace(successMarker, `${successMarker}\n  if (success) await __ktcCleanupLegacyMonthlyLayout(root, date);`);
  return next;
}

const originalCjsLoader = Module._extensions['.cjs'] || Module._extensions['.js'];
if (typeof originalCjsLoader !== 'function') throw new TypeError('CommonJS loader is unavailable');
if (!global.__KTC_WORKER_TEMPLATE_MAIN_PATCH__) {
  global.__KTC_WORKER_TEMPLATE_MAIN_PATCH__ = true;
  Module._extensions['.cjs'] = function patchedCjsLoader(module, filename) {
    if (path.basename(filename).toLowerCase() === 'main.cjs' && filename.endsWith(path.join('electron', 'main.cjs'))) {
      const source = fsSync.readFileSync(filename, 'utf8');
      return module._compile(patchMainSource(source), filename);
    }
    return originalCjsLoader(module, filename);
  };
}

module.exports = { buildWorkerSplit, PROCESS_CODES, PROCESS_FILE_PREFIXES };