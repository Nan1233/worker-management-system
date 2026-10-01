'use strict';

// Fast desktop Excel export.
// Build each active process directly from approved TiDB data into ONE worksheet.
// Do not load the large company template, do not create helper/metadata sheets,
// and do not run a second ExcelJS/JSZip workbook pass.
const Module = require('node:module');
const ExcelJS = require('exceljs');

const originalLoad = Module._load;
let patched = false;

function activeProcessCodes(payload) {
  return Object.entries(payload?.processes || {})
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0)
    .map(([code]) => String(code).trim().toUpperCase())
    .filter(Boolean);
}

function patchMonthly(mod) {
  if (!mod || mod.__ktcExcelExportPatched) return mod;
  const originalSplit = mod.buildSplitMonthlyWorkbooksLocal;
  const originalProcess = mod.buildProcessWorkbookLocal;
  const render = mod._private?.renderProcessSheet;
  const processSheets = mod.PROCESS_SHEETS;
  const fileName = mod.processWorkbookFileName;

  if (typeof originalSplit !== 'function' || typeof originalProcess !== 'function' || typeof render !== 'function') return mod;

  // One workbook + one visible sheet per active process. No template workbook,
  // no summary workbook, no hidden helper sheets, no second read/write pass.
  const buildOne = async (args = {}) => {
    const code = String(args.processCode || '').trim().toUpperCase();
    const config = processSheets?.[code];
    if (!config) return originalProcess(args);

    const payload = args.payload || {};
    const processData = payload.processes?.[code] || {};
    const yearMonth = String(payload.yearMonth || args.date || '').slice(0, 7);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KTC Production Control';
    workbook.created = new Date();
    workbook.modified = new Date();

    const startedAt = Date.now();
    const result = render(
      workbook,
      code,
      config,
      processData,
      yearMonth,
      mod._private?.formulaSettingsFor
        ? mod._private.formulaSettingsFor(payload, code)
        : (payload.formulaSettings?.[code] || payload.formulaSettings?.GLOBAL || undefined)
    );

    // renderProcessSheet creates exactly the process sheet. It must remain the
    // only worksheet in the workbook.
    if (workbook.worksheets.length !== 1 || workbook.worksheets[0].name !== config.sheet) {
      const names = workbook.worksheets.map((sheet) => sheet.name).join(', ');
      throw new Error(`Export ${code} phải chỉ có 1 sheet, thực tế: ${names}`);
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    console.info('[KTC-EXCEL-PERF] SINGLE_SHEET_EXPORT_DONE', {
      processCode: code,
      reportCount: processData.reports?.length || 0,
      rows: workbook.worksheets[0].rowCount,
      columns: workbook.worksheets[0].columnCount,
      bytes: buffer.length,
      elapsedMs: Date.now() - startedAt
    });

    return {
      buffer,
      result,
      processCode: code,
      processName: config.title,
      fileName: fileName(code, args.date, payload),
      formulaReplacementCount: 0
    };
  };

  mod.buildProcessWorkbookLocal = buildOne;
  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => {
    const processes = [];
    for (const code of activeProcessCodes(args.payload)) {
      processes.push(await buildOne({ ...args, processCode: code }));
    }
    return { summary: null, processes };
  };

  Object.defineProperty(mod, '__ktcExcelExportPatched', { value: true });
  return mod;
}

Module._load = function patchedLoad(request, parent, isMain) {
  if (!patched && typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) {
    const originalExtension = Module._extensions['.cjs'];
    Module._extensions['.cjs'] = function patchedExtension(module, filename) {
      let source = require('node:fs').readFileSync(filename, 'utf8');
      // The border pass touches every cell in the entire report and is one of
      // the most expensive operations for ~2,000 GC rows. Excel already renders
      // the table without it; skip only this redundant export-time pass.
      source = source.replace(/\s*applyAllBorders\(sheet, \{ fromRow: 4, toRow: totalRowNumber, fromCol: 1, toCol: lastColumn \}\);/, '');
      module._compile(source, filename);
    };
    try {
      const loaded = originalLoad.call(this, request, parent, isMain);
      patched = true;
      return patchMonthly(loaded);
    } finally {
      Module._extensions['.cjs'] = originalExtension;
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};
