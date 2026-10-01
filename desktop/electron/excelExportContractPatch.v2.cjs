'use strict';

// Fast GC Excel export: the template is the source of truth. The GC template
// should contain only the single "Cắt lồng" sheet. When it does, we skip the
// old JSZip load -> mutate -> re-compress pass entirely.
const Module = require('node:module');
const fs = require('node:fs/promises');
const path = require('node:path');
const JSZip = require('jszip');
const { buildProcessExcelLocal } = require('./companyExcelLocal.cjs');

const originalLoad = Module._load;
const originalFetch = globalThis.fetch;

function diagLog(message, data = {}) {
  const line = `[KTC-EXCEL-DIAG] ${message} ${JSON.stringify(data)}\n`;
  try { console.log(line.trim()); } catch (_) {}
  try {
    const root = process.env.LOCALAPPDATA || process.env.APPDATA || process.cwd();
    const file = path.join(root, 'KTC-Worker-Management', 'UserData', 'logs', 'desktop.log');
    void fs.mkdir(path.dirname(file), { recursive: true })
      .then(() => fs.appendFile(file, line, 'utf8'))
      .catch(() => {});
  } catch (_) {}
}

function now() { return Number(process.hrtime.bigint()) / 1e6; }

function activeProcessCodes(payload) {
  return Object.entries(payload?.processes || {})
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0)
    .map(([code]) => String(code).trim().toUpperCase())
    .filter(Boolean);
}

if (typeof originalFetch === 'function' && !globalThis.__KTC_COMPANY_DATA_SCOPE_FIX__) {
  globalThis.fetch = async function ktcCompanyDataScopeFetch(input, init) {
    const response = await originalFetch(input, init);
    const url = typeof input === 'string' ? input : String(input?.url || '');
    if (response?.ok && /\/reports\/export-excel\/company-data(?:\?|$)/.test(url)) {
      try {
        const json = await response.clone().json();
        if (json?.success && json?.data?.processes) globalThis.companyData = json.data;
      } catch (_) {}
    }
    return response;
  };
  globalThis.__KTC_COMPANY_DATA_SCOPE_FIX__ = true;
}

async function keepOnlyGcSheet(buffer) {
  const t0 = now();
  const zip = await JSZip.loadAsync(buffer);
  const workbookEntry = zip.file('xl/workbook.xml');
  if (!workbookEntry) return buffer;
  let xml = await workbookEntry.async('string');
  const sheets = [...xml.matchAll(/<sheet\b([^>]*)\/>/g)];
  const sheetNames = sheets.map((m) => m[1].match(/\bname="([^"]*)"/i)?.[1] || '');

  // The supplied GC template has exactly one worksheet. In that case the
  // buffer is already in the required shape; do not unzip/re-compress it.
  if (sheetNames.length === 1 && sheetNames[0] === 'Cắt lồng') {
    diagLog('SHEET_FILTER_SKIPPED_SINGLE_SHEET', {
      sheetCount: 1,
      keptSheet: 'Cắt lồng',
      ms: Math.round(now() - t0)
    });
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
  diagLog('SHEET_FILTER', {
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
    reportCount: reports.length,
    deductionTypeCount: args?.payload?.processes?.GC?.deductionTypes?.length || 0,
    defectTypeCount: args?.payload?.processes?.GC?.defectTypes?.length || 0
  });

  // companyExcelLocal loads the configured GC template and writes only the
  // Cắt lồng sheet. The template itself must therefore be kept in
  // desktop/assets/templates/bao-cao-cat-long-export.xlsx.
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

  result.buffer = await keepOnlyGcSheet(result.buffer);
  result.fileName = `04_CAT_LONG_${String(args?.date || '').slice(5, 7)}-${String(args?.date || '').slice(0, 4)}.xlsx`;
  result.processCode = 'GC';
  result.processName = 'CẮT/LỒNG';
  result.reportCount = reports.length;
  result.templateKind = 'FAST_GC_SINGLE_SHEET_TEMPLATE';
  return result;
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcExcelExportPatched) return mod;
  const originalProcess = mod.buildProcessWorkbookLocal;
  if (typeof originalProcess !== 'function') return mod;

  const process = async (args = {}) => {
    const code = String(args.processCode || '').trim().toUpperCase();
    const t0 = now();
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
      processes.push(await process({ ...args, processCode: code }));
    }
    diagLog('SPLIT_DONE', {
      processCount: processes.length,
      files: processes.map((x) => ({ code: x.processCode, bytes: x.buffer?.length || 0, reports: x.reportCount || 0 })),
      ms: Math.round(now() - t0)
    });
    return { summary: null, processes };
  };
  Object.defineProperty(mod, '__ktcExcelExportPatched', { value: true });
  return mod;
}

Module._load = function patchedLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) return patchMonthly(loaded);
  return loaded;
};
