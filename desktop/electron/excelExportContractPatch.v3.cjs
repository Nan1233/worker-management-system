'use strict';

// Precise GC export diagnostics + single-sheet fast path.
// This version measures the operations actually used by companyExcelLocal:
// xlsx.readFile() and xlsx.writeBuffer(). It intentionally does not unzip/
// re-compress the finished workbook because the GC template is already a
// single-sheet workbook (Cắt lồng).
const Module = require('node:module');
const fs = require('node:fs/promises');
const path = require('node:path');
const ExcelJS = require('exceljs');

const originalLoad = Module._load;
const originalFetch = globalThis.fetch;
const START = Number(process.hrtime.bigint()) / 1e6;
let seq = 0;

function now() { return Number(process.hrtime.bigint()) / 1e6; }
function mem() {
  const m = process.memoryUsage();
  return {
    rssMB: Math.round(m.rss / 1048576),
    heapMB: Math.round(m.heapUsed / 1048576),
    externalMB: Math.round(m.external / 1048576)
  };
}
function log(message, extra = {}) {
  const line = `[KTC-EXCEL-DIAG] #${++seq} +${Math.round(now() - START)}ms ${message} ${JSON.stringify({ ...mem(), ...extra })}\n`;
  try { console.log(line.trim()); } catch (_) {}
  try {
    const root = process.env.LOCALAPPDATA || process.env.APPDATA || process.cwd();
    const file = path.join(root, 'KTC-Worker-Management', 'UserData', 'logs', 'desktop.log');
    void fs.mkdir(path.dirname(file), { recursive: true }).then(() => fs.appendFile(file, line, 'utf8')).catch(() => {});
  } catch (_) {}
}

function installExcelDiagnostics() {
  const Workbook = ExcelJS.Workbook;
  if (!Workbook?.prototype || Workbook.prototype.__ktcV3Diag) return;
  const descriptor = Object.getOwnPropertyDescriptor(Workbook.prototype, 'xlsx');
  if (!descriptor?.get) return;
  const getter = descriptor.get;

  Object.defineProperty(Workbook.prototype, 'xlsx', {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    get() {
      const xlsx = getter.call(this);
      if (!xlsx || xlsx.__ktcV3Wrapped) return xlsx;

      const originalReadFile = xlsx.readFile?.bind(xlsx);
      const originalLoad = xlsx.load?.bind(xlsx);
      const originalWriteBuffer = xlsx.writeBuffer?.bind(xlsx);

      if (originalReadFile) {
        xlsx.readFile = async (...args) => {
          const t = now();
          log('EXCELJS_READFILE_START', { path: String(args[0] || '') });
          try {
            const result = await originalReadFile(...args);
            log('EXCELJS_READFILE_DONE', {
              ms: Math.round(now() - t),
              sheetCount: this.worksheets.length,
              sheets: this.worksheets.map(s => ({ name: s.name, rows: s.rowCount, cols: s.columnCount }))
            });
            return result;
          } catch (error) {
            log('EXCELJS_READFILE_ERROR', { ms: Math.round(now() - t), message: error?.message });
            throw error;
          }
        };
      }

      if (originalLoad) {
        xlsx.load = async (...args) => {
          const t = now();
          log('EXCELJS_LOAD_START', { bytes: Buffer.isBuffer(args[0]) ? args[0].length : undefined });
          try {
            const result = await originalLoad(...args);
            log('EXCELJS_LOAD_DONE', { ms: Math.round(now() - t), sheetCount: this.worksheets.length });
            return result;
          } catch (error) {
            log('EXCELJS_LOAD_ERROR', { ms: Math.round(now() - t), message: error?.message });
            throw error;
          }
        };
      }

      if (originalWriteBuffer) {
        xlsx.writeBuffer = async (...args) => {
          const t = now();
          log('EXCELJS_WRITEBUFFER_START', {
            sheetCount: this.worksheets.length,
            sheets: this.worksheets.map(s => ({ name: s.name, rows: s.rowCount, cols: s.columnCount }))
          });
          try {
            const result = await originalWriteBuffer(...args);
            log('EXCELJS_WRITEBUFFER_DONE', { ms: Math.round(now() - t), outputBytes: result?.length || 0 });
            return result;
          } catch (error) {
            log('EXCELJS_WRITEBUFFER_ERROR', { ms: Math.round(now() - t), message: error?.message, stack: error?.stack });
            throw error;
          }
        };
      }

      Object.defineProperty(xlsx, '__ktcV3Wrapped', { value: true });
      return xlsx;
    }
  });
  Object.defineProperty(Workbook.prototype, '__ktcV3Diag', { value: true });
  log('EXCELJS_DIAGNOSTICS_INSTALLED_V3');
}

installExcelDiagnostics();

if (typeof originalFetch === 'function' && !globalThis.__KTC_COMPANY_DATA_SCOPE_FIX__) {
  globalThis.fetch = async function ktcCompanyDataScopeFetch(input, init) {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const company = /\/reports\/export-excel\/company-data(?:\?|$)/.test(url);
    const t = now();
    if (company) log('API_COMPANY_DATA_START', { url });
    const response = await originalFetch(input, init);
    if (company) log('API_COMPANY_DATA_RESPONSE', { status: response?.status, ok: response?.ok, ms: Math.round(now() - t) });
    if (company && response?.ok) {
      try {
        const json = await response.clone().json();
        const totalReports = Object.values(json?.data?.processes || {}).reduce((n, x) => n + Number(x?.reports?.length || 0), 0);
        if (json?.success && json?.data) globalThis.companyData = json.data;
        log('API_COMPANY_DATA_PARSED', { totalReports });
      } catch (error) {
        log('API_COMPANY_DATA_PARSE_ERROR', { message: error?.message });
      }
    }
    return response;
  };
  globalThis.__KTC_COMPANY_DATA_SCOPE_FIX__ = true;
}

let lastTick = now();
const timer = setInterval(() => {
  const current = now();
  const drift = current - lastTick - 1000;
  if (drift > 500) log('EVENT_LOOP_STALL', { driftMs: Math.round(drift) });
  lastTick = current;
}, 1000);
timer.unref?.();

function activeCodes(payload) {
  return Object.entries(payload?.processes || {})
    .filter(([, x]) => Array.isArray(x?.reports) && x.reports.length)
    .map(([code]) => String(code).toUpperCase());
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcV3MonthlyPatched) return mod;
  const originalProcess = mod.buildProcessWorkbookLocal;
  if (typeof originalProcess !== 'function') {
    log('MONTHLY_PATCH_FAILED', { reason: 'buildProcessWorkbookLocal_missing' });
    return mod;
  }

  mod.buildProcessWorkbookLocal = async (args = {}) => {
    const code = String(args.processCode || '').trim().toUpperCase();
    const t = now();
    log('PROCESS_START', {
      processCode: code,
      date: args.date,
      reportCount: Number(args?.payload?.processes?.[code]?.reports?.length || 0)
    });
    try {
      const result = await originalProcess(args);
      log('PROCESS_BUILD_DONE', {
        processCode: code,
        reportCount: Number(result?.reportCount || 0),
        bytes: Number(result?.buffer?.length || 0),
        ms: Math.round(now() - t)
      });
      return result;
    } catch (error) {
      log('PROCESS_BUILD_ERROR', { processCode: code, ms: Math.round(now() - t), message: error?.message, stack: error?.stack });
      throw error;
    }
  };

  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const t = now();
    const codes = activeCodes(args.payload);
    log('SPLIT_START', { date: args.date, codes, totalReports: codes.reduce((n, c) => n + Number(args?.payload?.processes?.[c]?.reports?.length || 0), 0) });
    const processes = [];
    for (const code of codes) {
      const stage = now();
      log('SPLIT_PROCESS_START', { processCode: code });
      processes.push(await mod.buildProcessWorkbookLocal({ ...args, processCode: code }));
      log('SPLIT_PROCESS_DONE', { processCode: code, ms: Math.round(now() - stage) });
    }
    log('SPLIT_DONE', { processCount: processes.length, ms: Math.round(now() - t) });
    return { summary: null, processes };
  };

  Object.defineProperty(mod, '__ktcV3MonthlyPatched', { value: true });
  log('MONTHLY_PATCH_INSTALLED_V3');
  return mod;
}

Module._load = function patchedLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (request === 'exceljs') installExcelDiagnostics();
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) return patchMonthly(loaded);
  return loaded;
};

log('EXCEL_EXPORT_V3_READY');
