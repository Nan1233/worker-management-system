'use strict';

// Fast desktop Excel export patch.
// DB-approved data is authoritative. GC is built once by companyExcelLocal;
// do not load/write the resulting workbook a second time with ExcelJS.
const Module = require('node:module');
const JSZip = require('jszip');
const { buildProcessExcelLocal } = require('./companyExcelLocal.cjs');

const originalLoad = Module._load;
const originalFetch = globalThis.fetch;

function activeProcessCodes(payload) {
  return Object.entries(payload?.processes || {})
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0)
    .map(([code]) => String(code).trim().toUpperCase())
    .filter(Boolean);
}

// Keep the company-data response available globally for legacy desktop code paths.
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
  // Hide non-GC worksheets directly in workbook.xml. This avoids the very
  // expensive ExcelJS load -> mutate -> writeBuffer round-trip.
  const zip = await JSZip.loadAsync(buffer);
  const workbookEntry = zip.file('xl/workbook.xml');
  if (!workbookEntry) return buffer;
  let xml = await workbookEntry.async('string');
  xml = xml.replace(/<sheet\b([^>]*)\/>/g, (full, attrs) => {
    const nameMatch = attrs.match(/\bname="([^"]*)"/i);
    const name = nameMatch ? nameMatch[1] : '';
    if (name === 'Cắt lồng') return full.replace(/\sstate="[^"]*"/i, '');
    if (/\bstate="/i.test(attrs)) return `<sheet${attrs.replace(/\bstate="[^"]*"/i, ' state="veryHidden"')}/>`;
    return `<sheet${attrs} state="veryHidden"/>`;
  });
  zip.file('xl/workbook.xml', xml);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}

async function buildFastGcProcess(args) {
  const result = await buildProcessExcelLocal({
    appPath: args.appPath,
    date: args.date,
    processCode: 'GC',
    payload: {
      groups: {
        GIA_CONG: {
          processes: [{
            process: { process_code: 'GC', process_name: 'CẮT/LỒNG' },
            reports: args?.payload?.processes?.GC?.reports || [],
            deductionTypes: args?.payload?.processes?.GC?.deductionTypes || [],
            defectTypes: args?.payload?.processes?.GC?.defectTypes || []
          }]
        }
      }
    }
  });

  result.buffer = await keepOnlyGcSheet(result.buffer);
  result.fileName = `04_CAT_LONG_${String(args?.date || '').slice(5, 7)}-${String(args?.date || '').slice(0, 4)}.xlsx`;
  result.processCode = 'GC';
  result.processName = 'CẮT/LỒNG';
  result.reportCount = args?.payload?.processes?.GC?.reports?.length || 0;
  result.templateKind = 'FAST_GC_SINGLE_PASS';
  return result;
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcExcelExportPatched) return mod;
  const originalProcess = mod.buildProcessWorkbookLocal;
  if (typeof originalProcess !== 'function') return mod;

  const process = async (args = {}) => {
    const code = String(args.processCode || '').trim().toUpperCase();
    return code === 'GC' ? buildFastGcProcess(args) : originalProcess(args);
  };

  mod.buildProcessWorkbookLocal = process;
  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const processes = [];
    for (const code of activeProcessCodes(args.payload)) {
      const item = await process({ ...args, processCode: code });
      processes.push({ ...item, processCode: code, processName: item?.processName || code });
    }
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
