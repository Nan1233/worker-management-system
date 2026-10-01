'use strict';

const Module = require('node:module');
const { buildCompanyExcelLocal } = require('./companyExcelLocal.cjs');

const originalLoad = Module._load;

const log = (event, data = {}) => {
  try {
    const m = process.memoryUsage();
    console.log('[KTC-EXCEL-TEMPLATE]', event, JSON.stringify({
      elapsedMs: Math.round(Number(process.hrtime.bigint()) / 1e6),
      rssMB: Math.round(m.rss / 1048576),
      heapMB: Math.round(m.heapUsed / 1048576),
      ...data
    }));
  } catch (_) {}
};

function buildGcPayload(payload) {
  const source = payload?.processes?.GC || {};
  return {
    ...payload,
    groups: {
      ...(payload?.groups || {}),
      GIA_CONG: {
        code: 'GIA_CONG',
        title: 'Gia công',
        processes: [{
          process: {
            process_code: 'GC',
            process_name: 'Gia công'
          },
          reports: Array.isArray(source.reports) ? source.reports : [],
          deductionTypes: Array.isArray(source.deductionTypes) ? source.deductionTypes : [],
          defectTypes: Array.isArray(source.defectTypes) ? source.defectTypes : []
        }]
      }
    }
  };
}

async function buildGcFromCanonicalWriter(args) {
  const source = args?.payload?.processes?.GC || {};
  const reports = Array.isArray(source.reports) ? source.reports : [];
  log('BUILD_CANONICAL_GC_START', {
    date: args?.date,
    reportCount: reports.length,
    writer: 'companyExcelLocal.GIA_CONG'
  });

  const built = await buildCompanyExcelLocal({
    appPath: args.appPath,
    date: args.date,
    groupCode: 'GIA_CONG',
    payload: buildGcPayload(args.payload),
    existingFilePath: null
  });

  const yearMonth = String(args.date || '').slice(0, 7);
  const [year, month] = yearMonth.split('-');
  const fileName = `04_CAT_LONG_${month}-${year}.xlsx`;

  log('BUILD_CANONICAL_GC_DONE', {
    date: args?.date,
    reportCount: reports.length,
    sourceFileName: built.fileName,
    fileName,
    requestedYearMonth: built.requestedYearMonth,
    periodReplacementCount: built.periodReplacementCount
  });

  return {
    buffer: built.buffer,
    result: {
      code: 'GC',
      sheet: 'Cắt lồng',
      reportCount: reports.length
    },
    processCode: 'GC',
    processName: 'CẮT/LỒNG',
    fileName,
    reportCount: reports.length,
    formulaReplacementCount: Number(built.periodReplacementCount || 0),
    templateKind: 'CANONICAL_COMPANY_EXCEL_WRITER'
  };
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcV3MonthlyPatched) return mod;
  const original = mod.buildProcessWorkbookLocal;
  if (typeof original !== 'function') {
    log('PATCH_FAILED', { reason: 'buildProcessWorkbookLocal_missing' });
    return mod;
  }

  mod.buildProcessWorkbookLocal = async (args) => {
    const processCode = String(args?.processCode || '').trim().toUpperCase();
    return processCode === 'GC'
      ? buildGcFromCanonicalWriter(args)
      : original(args);
  };

  mod.buildSplitMonthlyWorkbooksLocal = async (args) => {
    const processes = [];
    for (const [code, data] of Object.entries(args?.payload?.processes || {})) {
      if (!Array.isArray(data?.reports) || !data.reports.length) continue;
      processes.push(await mod.buildProcessWorkbookLocal({
        ...args,
        processCode: code
      }));
    }
    return { summary: null, processes };
  };

  Object.defineProperty(mod, '__ktcV3MonthlyPatched', { value: true });
  log('MONTHLY_PATCH_INSTALLED_V3_CANONICAL_GC');
  return mod;
}

Module._load = function(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) {
    return patchMonthly(loaded);
  }
  return loaded;
};

log('EXCEL_EXPORT_V3_READY_CANONICAL');
