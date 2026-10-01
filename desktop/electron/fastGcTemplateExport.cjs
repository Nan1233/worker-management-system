'use strict';

const Module = require('node:module');
const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');

const originalLoad = Module._load;
let patched = false;

function activeCodes(payload) {
  return Object.entries(payload?.processes || {})
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0)
    .map(([code]) => String(code).trim().toUpperCase());
}

function patch(mod) {
  if (!mod || mod.__ktcFastGcTemplate) return mod;

  const privateApi = mod._private || {};
  const sheets = mod.PROCESS_SHEETS || {};
  const fileName = mod.processWorkbookFileName;
  const makeColumns = privateApi.makeColumns;
  const processDetailTypes = privateApi.processDetailTypes;
  const rowValues = privateApi.rowValues;
  const settingsForReport = privateApi.settingsForReport;
  const sortReports = privateApi.sortReports;

  if (!sheets.GC || typeof fileName !== 'function' || typeof makeColumns !== 'function' ||
      typeof processDetailTypes !== 'function' || typeof rowValues !== 'function' ||
      typeof settingsForReport !== 'function' || typeof sortReports !== 'function') {
    return mod;
  }

  async function buildGc(args = {}) {
    const payload = args.payload || {};
    const processData = payload.processes?.GC || {};
    const reports = sortReports(processData.reports || []);
    const deductionTypes = processDetailTypes('GC', processData, 'deductionTypes', 'deductions', 'deduction');
    const defectTypes = processDetailTypes('GC', processData, 'defectTypes', 'defects', 'defect');
    const columns = makeColumns('GC', deductionTypes, defectTypes);
    const settings = payload.formulaSettings?.GC || payload.formulaSettings?.GLOBAL || {};
    const templatePath = path.join(__dirname, '..', 'assets', 'templates', 'bao-cao-cat-long-export.xlsx');
    const started = Date.now();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    if (workbook.worksheets.length !== 1) {
      throw new Error(`Template GC phải chỉ có 1 sheet, nhận ${workbook.worksheets.length}.`);
    }
    const sheet = workbook.worksheets[0];
    sheet.name = 'CẮT LỒNG';

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
      const reportSettings = settingsForReport(report, settings, processData.formulaSettingsByDate || {});
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
    // Reuse the formatted rows already present in the one-sheet template.
    // Assigning Row.values changes values without rebuilding/copying every cell.
    for (let i = 0; i < matrix.length; i += 1) {
      const row = sheet.getRow(6 + i);
      row.values = matrix[i];
    }

    // Remove stale values below the generated range without rebuilding the sheet.
    const clearTo = Math.min(sheet.rowCount, dataEnd + 2);
    for (let r = dataEnd + 1; r <= clearTo; r += 1) sheet.getRow(r).values = [];

    for (const rowNumber of dateRows) {
      try {
        if (!sheet.getCell(rowNumber, 1).isMerged) sheet.mergeCells(rowNumber, 1, rowNumber, Math.min(4, columns.length));
      } catch (_) {}
      const cell = sheet.getCell(rowNumber, 1);
      cell.numFmt = '@';
    }

    const totalRow = dataEnd + 1;
    if (columns.length > 1) {
      try {
        if (!sheet.getCell(totalRow, 1).isMerged) sheet.mergeCells(totalRow, 1, totalRow, Math.min(10, columns.length));
      } catch (_) {}
    }
    sheet.getCell(totalRow, 1).value = 'TỔNG CỘNG';
    for (let c = Math.min(10, columns.length) + 1; c <= columns.length; c += 1) {
      sheet.getCell(totalRow, c).value = numericTotals[c - 1] || 0;
    }

    if (sheet.autoFilter) {
      sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, dataEnd), column: columns.length } };
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const elapsed = Date.now() - started;
    console.info('[KTC-EXCEL-PERF] GC_TEMPLATE_EXPORT_DONE', {
      processCode: 'GC',
      reportCount: reports.length,
      sheetCount: workbook.worksheets.length,
      rows: sheet.rowCount,
      columns: columns.length,
      elapsedMs: elapsed,
      builder: 'one-sheet-template-direct'
    });

    return {
      buffer,
      result: { code: 'GC', sheet: 'CẮT LỒNG', reportCount: reports.length },
      processCode: 'GC',
      processName: sheets.GC.title,
      fileName: fileName('GC', args.date, payload),
      formulaReplacementCount: 0
    };
  }

  function normalizeDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const s = String(value ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  const originalProcess = mod.buildProcessWorkbookLocal;
  const originalSplit = mod.buildSplitMonthlyWorkbooksLocal;
  if (typeof originalProcess !== 'function' || typeof originalSplit !== 'function') return mod;

  mod.buildProcessWorkbookLocal = async (args = {}) => {
    if (String(args.processCode || '').trim().toUpperCase() === 'GC') return buildGc(args);
    return originalProcess(args);
  };

  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const processes = [];
    for (const code of activeCodes(args.payload)) {
      processes.push(await mod.buildProcessWorkbookLocal({ ...args, processCode: code }));
    }
    return { summary: null, processes };
  };

  Object.defineProperty(mod, '__ktcFastGcTemplate', { value: true });
  return mod;
}

Module._load = function(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (!patched && typeof request === 'string' && /monthlyWorkbookLocal\\.cjs$/.test(request)) {
    patched = true;
    return patch(loaded);
  }
  return loaded;
};
