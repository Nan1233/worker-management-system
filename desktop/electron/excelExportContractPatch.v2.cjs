'use strict';

// Deep diagnostic instrumentation for desktop Excel export.
// This file intentionally measures the existing export path instead of changing
// the business data/Excel output logic. The goal is to identify the exact stage
// that consumes time or blocks the event loop.
const Module = require('node:module');
const fs = require('node:fs/promises');
const path = require('node:path');
const JSZip = require('jszip');
const { buildProcessExcelLocal } = require('./companyExcelLocal.cjs');

const originalLoad = Module._load;
const originalFetch = globalThis.fetch;
const START_MS = Number(process.hrtime.bigint()) / 1e6;
let traceSeq = 0;

function now() { return Number(process.hrtime.bigint()) / 1e6; }
function elapsed() { return Math.round(now() - START_MS); }

function snapshot(extra = {}) {
  const m = process.memoryUsage();
  return {
    rssMB: Math.round(m.rss / 1024 / 1024),
    heapUsedMB: Math.round(m.heapUsed / 1024 / 1024),
    heapTotalMB: Math.round(m.heapTotal / 1024 / 1024),
    externalMB: Math.round(m.external / 1024 / 1024),
    arrayBuffersMB: Math.round(m.arrayBuffers / 1024 / 1024),
    ...extra
  };
}

function diagLog(message, data = {}) {
  const line = `[KTC-EXCEL-DIAG] #${++traceSeq} +${elapsed()}ms ${message} ${JSON.stringify(snapshot(data))}\n`;
  try { console.log(line.trim()); } catch (_) {}
  try {
    const root = process.env.LOCALAPPDATA || process.env.APPDATA || process.cwd();
    const file = path.join(root, 'KTC-Worker-Management', 'UserData', 'logs', 'desktop.log');
    void fs.mkdir(path.dirname(file), { recursive: true })
      .then(() => fs.appendFile(file, line, 'utf8'))
      .catch(() => {});
  } catch (_) {}
}

function activeProcessCodes(payload) {
  return Object.entries(payload?.processes || {})
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0)
    .map(([code]) => String(code).trim().toUpperCase())
    .filter(Boolean);
}

// Detect event-loop stalls. A long synchronous ExcelJS operation will show up
// here even when no application-level log is emitted.
let lastTick = now();
const stallTimer = setInterval(() => {
  const current = now();
  const drift = current - lastTick - 1000;
  if (drift >= 250) {
    diagLog('EVENT_LOOP_STALL', {
      driftMs: Math.round(drift),
      thresholdMs: 250
    });
  }
  lastTick = current;
}, 1000);
if (typeof stallTimer.unref === 'function') stallTimer.unref();

// Log uncaught/rejected errors with the active stage.
process.on('uncaughtExceptionMonitor', (error) => {
  diagLog('UNCAUGHT_EXCEPTION', { name: error?.name, message: error?.message, stack: error?.stack });
});
process.on('unhandledRejection', (reason) => {
  diagLog('UNHANDLED_REJECTION', { reason: String(reason), stack: reason?.stack });
});

function installExcelJsDiagnostics(mod) {
  try {
    const Workbook = mod?.Workbook;
    if (!Workbook?.prototype || Workbook.prototype.__ktcDeepDiagInstalled) return;

    const xlsxDescriptor = Object.getOwnPropertyDescriptor(Workbook.prototype, 'xlsx');
    if (!xlsxDescriptor?.get) return;

    const originalGetter = xlsxDescriptor.get;
    Object.defineProperty(Workbook.prototype, 'xlsx', {
      configurable: xlsxDescriptor.configurable,
      enumerable: xlsxDescriptor.enumerable,
      get() {
        const xlsx = originalGetter.call(this);
        if (!xlsx || xlsx.__ktcDeepDiagWrapped) return xlsx;

        const originalLoadMethod = xlsx.load?.bind(xlsx);
        const originalWriteBuffer = xlsx.writeBuffer?.bind(xlsx);

        if (originalLoadMethod) {
          xlsx.load = async (...args) => {
            const t0 = now();
            const input = args[0];
            diagLog('EXCELJS_LOAD_START', {
              inputType: Buffer.isBuffer(input) ? 'Buffer' : typeof input,
              inputBytes: Buffer.isBuffer(input) ? input.length : undefined
            });
            try {
              const result = await originalLoadMethod(...args);
              diagLog('EXCELJS_LOAD_DONE', {
                ms: Math.round(now() - t0),
                sheetCount: this.worksheets?.length || 0,
                sheetNames: this.worksheets?.map((s) => s.name).slice(0, 20) || [],
                rowCounts: this.worksheets?.map((s) => s.rowCount).slice(0, 20) || [],
                columnCounts: this.worksheets?.map((s) => s.columnCount).slice(0, 20) || []
              });
              return result;
            } catch (error) {
              diagLog('EXCELJS_LOAD_ERROR', { ms: Math.round(now() - t0), message: error?.message, stack: error?.stack });
              throw error;
            }
          };
        }

        if (originalWriteBuffer) {
          xlsx.writeBuffer = async (...args) => {
            const t0 = now();
            diagLog('EXCELJS_WRITEBUFFER_START', {
              sheetCount: this.worksheets?.length || 0,
              sheetNames: this.worksheets?.map((s) => s.name).slice(0, 20) || [],
              rowCounts: this.worksheets?.map((s) => s.rowCount).slice(0, 20) || [],
              columnCounts: this.worksheets?.map((s) => s.columnCount).slice(0, 20) || []
            });
            try {
              const result = await originalWriteBuffer(...args);
              diagLog('EXCELJS_WRITEBUFFER_DONE', {
                ms: Math.round(now() - t0),
                outputBytes: result?.length || 0
              });
              return result;
            } catch (error) {
              diagLog('EXCELJS_WRITEBUFFER_ERROR', { ms: Math.round(now() - t0), message: error?.message, stack: error?.stack });
              throw error;
            }
          };
        }

        Object.defineProperty(xlsx, '__ktcDeepDiagWrapped', { value: true });
        return xlsx;
      }
    });
    Object.defineProperty(Workbook.prototype, '__ktcDeepDiagInstalled', { value: true });
    diagLog('EXCELJS_DIAGNOSTICS_INSTALLED');
  } catch (error) {
    diagLog('EXCELJS_DIAGNOSTICS_INSTALL_ERROR', { message: error?.message, stack: error?.stack });
  }
}

if (typeof originalFetch === 'function' && !globalThis.__KTC_COMPANY_DATA_SCOPE_FIX__) {
  globalThis.fetch = async function ktcCompanyDataScopeFetch(input, init) {
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const isCompanyData = /\/reports\/export-excel\/company-data(?:\?|$)/.test(url);
    const t0 = now();
    if (isCompanyData) diagLog('API_COMPANY_DATA_FETCH_START', { url });
    const response = await originalFetch(input, init);
    if (isCompanyData) {
      diagLog('API_COMPANY_DATA_FETCH_RESPONSE', { status: response?.status, ok: response?.ok, ms: Math.round(now() - t0) });
    }
    if (response?.ok && isCompanyData) {
      try {
        const cloneStart = now();
        const json = await response.clone().json();
        diagLog('API_COMPANY_DATA_JSON_PARSED', {
          ms: Math.round(now() - cloneStart),
          success: json?.success,
          totalReports: Object.values(json?.data?.processes || {}).reduce((n, x) => n + Number(x?.reports?.length || 0), 0),
          processCounts: Object.fromEntries(Object.entries(json?.data?.processes || {}).map(([k, x]) => [k, Number(x?.reports?.length || 0)]))
        });
        if (json?.success && json?.data?.processes) globalThis.companyData = json.data;
      } catch (error) {
        diagLog('API_COMPANY_DATA_JSON_PARSE_ERROR', { message: error?.message });
      }
    }
    return response;
  };
  globalThis.__KTC_COMPANY_DATA_SCOPE_FIX__ = true;
}

async function keepOnlyGcSheet(buffer) {
  const t0 = now();
  diagLog('SHEET_FILTER_START', { inputBytes: buffer?.length || 0 });
  const zip = await JSZip.loadAsync(buffer);
  const workbookEntry = zip.file('xl/workbook.xml');
  if (!workbookEntry) {
    diagLog('SHEET_FILTER_NO_WORKBOOK_XML', { ms: Math.round(now() - t0) });
    return buffer;
  }
  let xml = await workbookEntry.async('string');
  const sheets = [...xml.matchAll(/<sheet\b([^>]*)\/>/g)];
  const sheetNames = sheets.map((m) => m[1].match(/\bname="([^"]*)"/i)?.[1] || '');
  diagLog('SHEET_FILTER_INSPECTED', { sheetCount: sheets.length, sheetNames, ms: Math.round(now() - t0) });

  if (sheetNames.length === 1 && sheetNames[0] === 'Cắt lồng') {
    diagLog('SHEET_FILTER_SKIPPED_SINGLE_SHEET', { sheetCount: 1, keptSheet: 'Cắt lồng', ms: Math.round(now() - t0) });
    return buffer;
  }

  let hiddenCount = 0;
  xml = xml.replace(/<sheet\b([^>]*)\/>/g, (full, attrs) => {
    const name = attrs.match(/\bname="([^"]*)"/i)?.[1] || '';
    if (name === 'Cắt lồng') return full.replace(/\sstate="[^"]*"/i, '');
    hiddenCount += 1;
    if (/\bstate="/i.test(attrs)) return `<sheet${attrs.replace(/\bstate="[^"]*"/i, ' state="veryHidden"')}/>`;
    return `<sheet${attrs} state="veryHidden"/>`;
  });
  zip.file('xl/workbook.xml', xml);
  const output = Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  diagLog('SHEET_FILTER_DONE', {
    inputBytes: buffer.length,
    outputBytes: output.length,
    sheetCount: sheets.length,
    hiddenCount,
    keptSheet: 'Cắt lồng',
    ms: Math.round(now() - t0)
  });
  return output;
}

async function buildFastGcProcess(args) {
  const reports = args?.payload?.processes?.GC?.reports || [];
  const t0 = now();
  diagLog('GC_BUILD_START', {
    date: args.date,
    processCode: 'GC',
    reportCount: reports.length,
    deductionTypeCount: args?.payload?.processes?.GC?.deductionTypes?.length || 0,
    defectTypeCount: args?.payload?.processes?.GC?.defectTypes?.length || 0,
    appPath: args.appPath
  });

  const result = await buildProcessExcelLocal({
    appPath: args.appPath,
    date: args.date,
    processCode: 'GC',
    payload: {
      groups: {
        GIA_CONG: {
          processes: [{
            process: { process_code: 'GC', process_name: 'CẮT/LỒNG' },
            reports,
            deductionTypes: args?.payload?.processes?.GC?.deductionTypes || [],
            defectTypes: args?.payload?.processes?.GC?.defectTypes || []
          }]
        }
      }
    }
  });

  diagLog('GC_BUILD_DONE', {
    reportCount: reports.length,
    outputBufferBytes: result?.buffer?.length || 0,
    ms: Math.round(now() - t0)
  });

  const filterStart = now();
  result.buffer = await keepOnlyGcSheet(result.buffer);
  diagLog('GC_SHEET_FILTER_STAGE_DONE', {
    ms: Math.round(now() - filterStart),
    totalMs: Math.round(now() - t0),
    outputBufferBytes: result?.buffer?.length || 0
  });

  result.fileName = `04_CAT_LONG_${String(args?.date || '').slice(5, 7)}-${String(args?.date || '').slice(0, 4)}.xlsx`;
  result.processCode = 'GC';
  result.processName = 'CẮT/LỒNG';
  result.reportCount = reports.length;
  result.templateKind = 'DEEP_DIAGNOSTIC_SINGLE_SHEET';
  diagLog('GC_BUILD_RETURN', { totalMs: Math.round(now() - t0), fileName: result.fileName });
  return result;
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcExcelExportPatched) return mod;
  const originalProcess = mod.buildProcessWorkbookLocal;
  if (typeof originalProcess !== 'function') {
    diagLog('PATCH_MONTHLY_FAILED', { reason: 'buildProcessWorkbookLocal_missing' });
    return mod;
  }

  const process = async (args = {}) => {
    const code = String(args.processCode || '').trim().toUpperCase();
    const t0 = now();
    diagLog('PROCESS_START', {
      processCode: code,
      date: args.date,
      reportCount: Number(args?.payload?.processes?.[code]?.reports?.length || 0)
    });
    try {
      const result = code === 'GC'
        ? await buildFastGcProcess(args)
        : await originalProcess(args);
      diagLog('PROCESS_BUILD_DONE', {
        processCode: code,
        reportCount: Number(result?.reportCount || 0),
        bufferBytes: Number(result?.buffer?.length || 0),
        ms: Math.round(now() - t0)
      });
      return result;
    } catch (error) {
      diagLog('PROCESS_BUILD_ERROR', { processCode: code, ms: Math.round(now() - t0), message: error?.message, stack: error?.stack });
      throw error;
    }
  };

  mod.buildProcessWorkbookLocal = process;
  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const t0 = now();
    const codes = activeProcessCodes(args.payload);
    diagLog('SPLIT_START', {
      date: args.date,
      activeProcessCodes: codes,
      totalReports: codes.reduce((n, code) => n + Number(args?.payload?.processes?.[code]?.reports?.length || 0), 0)
    });
    const processes = [];
    for (const code of codes) {
      const stageStart = now();
      diagLog('SPLIT_PROCESS_START', { processCode: code });
      processes.push(await process({ ...args, processCode: code }));
      diagLog('SPLIT_PROCESS_DONE', { processCode: code, ms: Math.round(now() - stageStart) });
    }
    diagLog('SPLIT_DONE', {
      processCount: processes.length,
      files: processes.map((x) => ({ code: x.processCode, bytes: x.buffer?.length || 0, reports: x.reportCount || 0 })),
      ms: Math.round(now() - t0)
    });
    return { summary: null, processes };
  };
  Object.defineProperty(mod, '__ktcExcelExportPatched', { value: true });
  diagLog('MONTHLY_PATCH_INSTALLED');
  return mod;
}

Module._load = function patchedLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (request === 'exceljs') installExcelJsDiagnostics(loaded);
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) return patchMonthly(loaded);
  return loaded;
};
