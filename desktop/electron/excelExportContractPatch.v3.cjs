'use strict';

const Module = require('node:module');
const ExcelJS = require('exceljs');
const { buildCompanyExcelLocal } = require('./companyExcelLocal.cjs');
const { splitAndReduceGcWorkbook } = require('./excelWorkbookSheetReducer.cjs');

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

function columnLetters(columnNumber) {
  let n = Number(columnNumber);
  let result = '';
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function hasDirectSelfReference(formula, rowNumber, columnNumber) {
  if (typeof formula !== 'string' || !formula.trim()) return false;
  const address = columnLetters(columnNumber);
  const pattern = new RegExp(`(^|[^A-Z0-9_])\\$?${address}\\$?${rowNumber}(?=$|[^0-9])`, 'i');
  return pattern.test(formula.replace(/\s+/g, ''));
}

async function sanitizeCircularFormulas(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  let fixedCount = 0;
  const fixedCells = [];

  workbook.eachSheet((sheet) => {
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        let formula = '';
        try {
          formula = typeof cell.formula === 'string' ? cell.formula : '';
        } catch (_) {}

        if (!formula && cell.value && typeof cell.value === 'object' && typeof cell.value.formula === 'string') {
          formula = cell.value.formula;
        }
        if (!formula || !hasDirectSelfReference(formula, rowNumber, columnNumber)) return;

        const value = cell.value;
        const cachedResult = value && typeof value === 'object'
          ? (value.result ?? cell.result ?? null)
          : null;

        // Export là báo cáo chốt dữ liệu từ DB. Với công thức tự tham chiếu,
        // giữ giá trị cache thay vì để Excel/WPS báo Circular Reference.
        cell.value = cachedResult;
        fixedCount += 1;
        if (fixedCells.length < 50) fixedCells.push(`${sheet.name}!${columnLetters(columnNumber)}${rowNumber}`);
      });
    });
  });

  workbook.calcProperties.fullCalcOnLoad = false;
  workbook.calcProperties.forceFullCalc = false;
  workbook.calcProperties.calcMode = 'auto';

  if (fixedCount) {
    log('CIRCULAR_FORMULAS_SANITIZED', { fixedCount, cells: fixedCells });
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
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

  let processedBuffer = await splitAndReduceGcWorkbook(built.buffer);
  processedBuffer = await sanitizeCircularFormulas(processedBuffer);

  const yearMonth = String(args.date || '').slice(0, 7);
  const [year, month] = yearMonth.split('-');
  const fileName = `04_CAT_LONG_${month}-${year}.xlsx`;

  log('BUILD_CANONICAL_GC_DONE', {
    date: args?.date,
    reportCount: reports.length,
    sourceFileName: built.fileName,
    fileName,
    requestedYearMonth: built.requestedYearMonth,
    periodReplacementCount: built.periodReplacementCount,
    sheetReducer: true,
    circularFormulaSanitizer: true
  });

  return {
    buffer: processedBuffer,
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
    templateKind: 'CANONICAL_COMPANY_EXCEL_WRITER_SHEET_REDUCED'
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
  if (typeof request === 'string' && /monthlyWorkbookLocal\\.cjs$/.test(request)) {
    return patchMonthly(loaded);
  }
  return loaded;
};

log('EXCEL_EXPORT_V3_READY_CANONICAL');
