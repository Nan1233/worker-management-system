'use strict';

const Module = require('node:module');
const ExcelJS = require('exceljs');
const path = require('node:path');

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

/**
 * GC must be exported from the requested one-sheet template directly.
 * Do not pass through companyExcelLocal's legacy A+B workbook and do not
 * reduce/split that workbook afterwards: the legacy template contains the
 * old TỔNG ĐIỂM / TG-KH-TT / KẾ HOẠCH sheets which must never reach the GC file.
 */
async function buildGcFromOneSheetTemplate(args, monthlyModule) {
  const source = args?.payload?.processes?.GC || {};
  const reports = monthlyModule._private.sortReports(source.reports || []);
  const processDetailTypes = monthlyModule._private.processDetailTypes;
  const makeColumns = monthlyModule._private.makeColumns;
  const rowValues = monthlyModule._private.rowValues;
  const settingsForReport = monthlyModule._private.settingsForReport;

  if (typeof processDetailTypes !== 'function' || typeof makeColumns !== 'function' ||
      typeof rowValues !== 'function' || typeof settingsForReport !== 'function') {
    throw new Error('Thiếu API nội bộ để xuất template Cắt lồng một sheet.');
  }

  const deductionTypes = processDetailTypes('GC', source, 'deductionTypes', 'deductions', 'deduction');
  const defectTypes = processDetailTypes('GC', source, 'defectTypes', 'defects', 'defect');
  const columns = makeColumns('GC', deductionTypes, defectTypes);
  const settings = args?.payload?.formulaSettings?.GC || args?.payload?.formulaSettings?.GLOBAL || {};
  const templatePath = path.join(args.appPath, 'assets', 'templates', 'bao-cao-cat-long-export.xlsx');
  const started = Date.now();

  log('BUILD_GC_ONE_SHEET_START', {
    date: args?.date,
    reportCount: reports.length,
    templatePath,
    writer: 'bao-cao-cat-long-export.xlsx'
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  if (workbook.worksheets.length !== 1) {
    throw new Error(`Template GC phải chỉ có 1 sheet, nhận ${workbook.worksheets.length}.`);
  }

  const sheet = workbook.worksheets[0];
  sheet.name = 'CẮT LỒNG';
  sheet.state = 'visible';

  const matrix = [];
  const dateRows = [];
  const numericTotals = new Array(columns.length).fill(0);
  let previousDate = '';
  let sequenceInDate = 0;

  for (const report of reports) {
    const currentDate = String(report.work_date || '').slice(0, 10);
    if (currentDate !== previousDate) {
      const row = new Array(columns.length).fill(null);
      row[0] = normalizeDate(report.work_date) || String(report.work_date || '');
      matrix.push(row);
      dateRows.push(6 + matrix.length - 1);
      sequenceInDate = 0;
    }

    sequenceInDate += 1;
    const reportSettings = settingsForReport(report, settings, source.formulaSettingsByDate || {});
    const values = rowValues('GC', report, deductionTypes, defectTypes, reportSettings);
    values.stt = sequenceInDate;
    const row = columns.map((column, index) => {
      const value = values[column.key] === undefined ? null : values[column.key];
      if (typeof value === 'number' && Number.isFinite(value)) numericTotals[index] += value;
      return value;
    });
    matrix.push(row);
    previousDate = currentDate;
  }

  const dataEnd = 5 + matrix.length;
  for (let i = 0; i < matrix.length; i += 1) {
    const row = sheet.getRow(6 + i);
    row.values = matrix[i];
  }

  // Clear stale sample rows below the generated range, while keeping the
  // template's formatting for future manual edits.
  const clearTo = Math.min(sheet.rowCount, dataEnd + 2);
  for (let r = dataEnd + 1; r <= clearTo; r += 1) sheet.getRow(r).values = [];

  for (const rowNumber of dateRows) {
    try {
      if (!sheet.getCell(rowNumber, 1).isMerged) {
        sheet.mergeCells(rowNumber, 1, rowNumber, Math.min(4, columns.length));
      }
    } catch (_) {}
    sheet.getCell(rowNumber, 1).numFmt = '@';
  }

  const totalRow = dataEnd + 1;
  if (columns.length > 1) {
    try {
      if (!sheet.getCell(totalRow, 1).isMerged) {
        sheet.mergeCells(totalRow, 1, totalRow, Math.min(10, columns.length));
      }
    } catch (_) {}
  }
  sheet.getCell(totalRow, 1).value = 'TỔNG CỘNG';
  for (let c = Math.min(10, columns.length) + 1; c <= columns.length; c += 1) {
    sheet.getCell(totalRow, c).value = numericTotals[c - 1] || 0;
  }

  if (sheet.autoFilter) {
    sheet.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: Math.max(5, dataEnd), column: columns.length }
    };
  }

  workbook.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];
  workbook.calcProperties.fullCalcOnLoad = false;
  workbook.calcProperties.forceFullCalc = false;
  workbook.calcProperties.calcMode = 'auto';

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const elapsed = Date.now() - started;
  log('BUILD_GC_ONE_SHEET_DONE', {
    date: args?.date,
    reportCount: reports.length,
    sheetCount: workbook.worksheets.length,
    rows: sheet.rowCount,
    columns: columns.length,
    elapsedMs: elapsed
  });

  return {
    buffer,
    result: { code: 'GC', sheet: 'CẮT LỒNG', reportCount: reports.length },
    processCode: 'GC',
    processName: 'CẮT/LỒNG',
    fileName: `04_CAT_LONG_${String(args.date || '').slice(5, 7)}-${String(args.date || '').slice(0, 4)}.xlsx`,
    reportCount: reports.length,
    formulaReplacementCount: 0,
    templateKind: 'ONE_SHEET_GC_TEMPLATE'
  };
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
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
      ? buildGcFromOneSheetTemplate(args, mod)
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
  log('MONTHLY_PATCH_INSTALLED_V3_ONE_SHEET_GC');
  return mod;
}

Module._load = function(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) {
    return patchMonthly(loaded);
  }
  return loaded;
};

log('EXCEL_EXPORT_V3_READY_ONE_SHEET');
