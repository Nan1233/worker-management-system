'use strict';

const Module = require('node:module');
const ExcelJS = require('exceljs');
const fs = require('node:fs');

const originalLoad = Module._load;
let patched = false;

function activeCodes(payload) {
  return Object.entries(payload?.processes || {})
    .filter(([, data]) => Array.isArray(data?.reports) && data.reports.length > 0)
    .map(([code]) => String(code).trim().toUpperCase());
}

function patch(mod) {
  if (!mod || mod.__ktcFastSingleSheet) return mod;
  const render = mod._private?.renderProcessSheet;
  const sheets = mod.PROCESS_SHEETS;
  const fileName = mod.processWorkbookFileName;
  if (typeof render !== 'function' || !sheets || typeof fileName !== 'function') return mod;

  async function build(args = {}) {
    const code = String(args.processCode || '').trim().toUpperCase();
    const config = sheets[code];
    if (!config) throw new Error(`Unsupported process: ${code}`);
    const payload = args.payload || {};
    const processData = payload.processes?.[code] || {};
    const yearMonth = String(payload.yearMonth || args.date || '').slice(0, 7);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'KTC Production Control';
    workbook.created = new Date();
    workbook.modified = new Date();
    const started = Date.now();
    render(workbook, code, config, processData, yearMonth,
      payload.formulaSettings?.[code] || payload.formulaSettings?.GLOBAL || {});
    if (workbook.worksheets.length !== 1) {
      throw new Error(`Export ${code} phải chỉ có 1 sheet`);
    }
    const writeStarted = Date.now();
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    console.info('[KTC-EXCEL-PERF] SINGLE_SHEET_EXPORT_DONE', {
      processCode: code,
      reportCount: processData.reports?.length || 0,
      rows: workbook.worksheets[0].rowCount,
      columns: workbook.worksheets[0].columnCount,
      renderMs: writeStarted - started,
      writeMs: Date.now() - writeStarted,
      totalMs: Date.now() - started
    });
    return {
      buffer,
      result: { code, sheet: config.sheet, reportCount: processData.reports?.length || 0 },
      processCode: code,
      processName: config.title,
      fileName: fileName(code, args.date, payload),
      formulaReplacementCount: 0
    };
  }

  mod.buildProcessWorkbookLocal = build;
  mod.buildSplitMonthlyWorkbooksLocal = async (args = {}) => ({
    summary: null,
    processes: await Promise.all(activeCodes(args.payload).map((code) => build({ ...args, processCode: code })))
  });
  Object.defineProperty(mod, '__ktcFastSingleSheet', { value: true });
  return mod;
}

Module._load = function(request, parent, isMain) {
  if (!patched && typeof request === 'string' && /monthlyWorkbookLocal\\.cjs$/.test(request)) {
    const originalExtension = Module._extensions['.cjs'];
    Module._extensions['.cjs'] = function(module, filename) {
      let source = fs.readFileSync(filename, 'utf8');
      source = source.replace(/\\s*applyAllBorders\\(sheet, \\{ fromRow: 4, toRow: totalRowNumber, fromCol: 1, toCol: lastColumn \\}\\);/, '');
      module._compile(source, filename);
    };
    try {
      const loaded = originalLoad.call(this, request, parent, isMain);
      patched = true;
      return patch(loaded);
    } finally {
      Module._extensions['.cjs'] = originalExtension;
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};
