'use strict';

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const monthly = require('./monthlyWorkbookLocal.cjs');
const { buildWorkerProcessWorkbook, PROCESS_FILE_PREFIXES } = require('./workerReportTemplateLocal.v2.cjs');

const PROCESS_CODES = Object.freeze(['CAN', 'EP', 'XLBV', 'GC', 'MAI', 'DO', 'K1', 'K2', 'SX3']);

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
    processes.push(await buildWorkerProcessWorkbook({
      appPath,
      processCode: item.processCode,
      processName: item.processName,
      date,
      processData: item.data
    }));
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
  next = next.replace(/\n\s*await writeLog\('INFO', 'MONTHLY_SPLIT_WORKBOOKS_UPDATED', \{/, '\n    await writeLog(\'INFO\', \'MONTHLY_WORKER_TEMPLATE_UPDATED\', {');
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