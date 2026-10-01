'use strict';

// Desktop Excel export optimization patch.
// The approved DB payload is authoritative. Do not load a generated XLSX back
// into ExcelJS and rewrite it: that was the main source of the multi-minute
// export for the 1,942-row GC workbook.
const Module = require('node:module');
const ExcelJS = require('exceljs');

const originalLoad = Module._load;
const originalFetch = globalThis.fetch;

function activeProcessCodes(payload) {
  const processes = payload?.processes || {};
  return Object.entries(processes)
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0)
    .map(([code]) => String(code).trim().toUpperCase())
    .filter(Boolean);
}

// main.cjs currently references `companyData` after its try/catch block.
// In CommonJS, a global property is visible as a free identifier. Capture the
// same authoritative payload when fetchCompanyData() receives it so the final
// result calculation cannot throw ReferenceError after the XLSX was saved.
if (typeof originalFetch === 'function' && !globalThis.__KTC_COMPANY_DATA_SCOPE_FIX__) {
  globalThis.fetch = async function ktcCompanyDataScopeFetch(input, init) {
    const response = await originalFetch(input, init);
    const url = typeof input === 'string' ? input : String(input?.url || '');
    if (response?.ok && /\/reports\/export-excel\/company-data(?:\?|$)/.test(url)) {
      try {
        const clone = response.clone();
        const json = await clone.json();
        if (json?.success && json?.data?.processes) {
          globalThis.companyData = json.data;
        }
      } catch (_) {
        // Leave the original response untouched; main.cjs will report its own
        // fetch/JSON error if the payload is invalid.
      }
    }
    return response;
  };
  globalThis.__KTC_COMPANY_DATA_SCOPE_FIX__ = true;
}

function createNoopWorksheet() {
  const noopObject = new Proxy({}, {
    get(target, property) {
      if (property === 'getCell' || property === 'getColumn' || property === 'getRow') {
        return () => new Proxy({}, {
          get() { return undefined; },
          set() { return true; }
        });
      }
      if (property === 'mergeCells' || property === 'unMergeCells' || property === 'addRow') {
        return () => undefined;
      }
      return undefined;
    },
    set() { return true; }
  });
  return noopObject;
}

async function buildProcessWithoutGcHelper(originalProcess, args) {
  // The legacy GC helper creates 2,000+ formula rows, styles every helper cell,
  // and serializes them into the XLSX. It is not part of the requested output:
  // the GC workbook should contain only the visible CẮT LỒNG sheet. The helper
  // is therefore suppressed at worksheet creation time, avoiding any second
  // ExcelJS load/write pass while preserving the main process sheet and the
  // hidden DB sync metadata.
  const originalAddWorksheet = ExcelJS.Workbook.prototype.addWorksheet;
  ExcelJS.Workbook.prototype.addWorksheet = function optimizedAddWorksheet(name, options) {
    if (String(name || '') === 'TAY MÁY CẮT LỒNG') {
      return createNoopWorksheet();
    }
    return originalAddWorksheet.call(this, name, options);
  };
  try {
    return await originalProcess(args);
  } finally {
    ExcelJS.Workbook.prototype.addWorksheet = originalAddWorksheet;
  }
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcExcelExportPatched) return mod;

  const originalProcess = mod.buildProcessWorkbookLocal;
  const originalSplit = mod.buildSplitMonthlyWorkbooksLocal;
  if (typeof originalProcess !== 'function' || typeof originalSplit !== 'function') return mod;

  // Only render process workbooks that actually contain approved reports.
  // Do not build the unused monthly summary and do not call ExcelJS.load()
  // + writeBuffer() a second time on the generated workbook.
  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const processes = [];
    for (const code of activeProcessCodes(args.payload)) {
      const result = await originalProcessForCode({ ...args, processCode: code });
      processes.push({
        ...result,
        processCode: code,
        processName: result?.processName || code
      });
    }
    return { summary: null, processes };
  };

  const originalProcessForCode = async (args) => {
    const code = String(args?.processCode || '').trim().toUpperCase();
    if (code === 'GC') return buildProcessWithoutGcHelper(originalProcess, args);
    return originalProcess(args);
  };

  Object.defineProperty(mod, '__ktcExcelExportPatched', { value: true });
  return mod;
}

Module._load = function patchedLoad(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) {
    return patchMonthly(loaded);
  }
  return loaded;
};
