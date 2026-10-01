'use strict';

// Desktop Excel export optimization patch.
// IMPORTANT: the DB payload is already authoritative. Do not load the generated
// workbook again with ExcelJS and rewrite every cell: that turns a single
// 1,942-row GC export into a multi-minute operation.
const Module = require('node:module');

const originalLoad = Module._load;

function activeProcessCodes(payload) {
  const processes = payload?.processes || {};
  return Object.entries(processes)
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0)
    .map(([code]) => String(code).trim().toUpperCase())
    .filter(Boolean);
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcExcelExportPatched) return mod;

  const originalSplit = mod.buildSplitMonthlyWorkbooksLocal;
  const originalProcess = mod.buildProcessWorkbookLocal;

  if (typeof originalSplit !== 'function' || typeof originalProcess !== 'function') {
    return mod;
  }

  // Build only processes that actually contain approved DB reports.
  // Do NOT call buildMonthlySummaryWorkbookLocal here and do NOT patch/reload
  // the produced XLSX buffer. buildProcessWorkbookLocal already renders from
  // the authoritative DB payload and writes the workbook once.
  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const codes = activeProcessCodes(args.payload);
    const processes = [];

    for (const code of codes) {
      const result = await originalProcess({ ...args, processCode: code });
      processes.push({
        ...result,
        processCode: code,
        processName: result?.processName || code
      });
    }

    return {
      summary: null,
      processes
    };
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
