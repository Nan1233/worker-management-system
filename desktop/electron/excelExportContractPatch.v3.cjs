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

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function normalizeSheetName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Đ/g, 'D')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/gi, '')
    .toUpperCase();
}

function findGcTemplateSheet(workbook) {
  const sheets = workbook.worksheets || [];
  const exact = sheets.find((sheet) => normalizeSheetName(sheet.name) === 'CATLONG');
  if (exact) return exact;

  const partial = sheets.find((sheet) => {
    const name = normalizeSheetName(sheet.name);
    return name.includes('CATLONG');
  });
  if (partial) return partial;

  throw new Error(`Không tìm thấy sheet Cắt lồng trong template GC. Các sheet hiện có: ${sheets.map((s) => s.name).join(', ')}`);
}

function reduceWorkbookToSheet(workbook, keepSheet) {
  for (const sheet of [...workbook.worksheets]) {
    if (sheet.id !== keepSheet.id) {
      workbook.removeWorksheet(sheet.id);
    }
  }
}

function copyRenderedSheetIntoTemplate(target, source) {
  const sourceLastRow = Math.max(1, source.rowCount);
  const targetLastRow = Math.max(sourceLastRow, target.rowCount);

  // Clear generated-area values but keep the template's formatting, widths,
  // borders, fills, fonts and print setup intact.
  for (let r = 6; r <= targetLastRow; r += 1) {
    target.getRow(r).values = [];
  }

  for (let r = 6; r <= sourceLastRow; r += 1) {
    const sourceRow = source.getRow(r);
    const targetRow = target.getRow(r);
    if (sourceRow.height != null) targetRow.height = sourceRow.height;

    for (let c = 1; c <= source.columnCount; c += 1) {
      const sourceCell = source.getCell(r, c);
      if (sourceCell.value !== null && sourceCell.value !== undefined) {
        target.getCell(r, c).value = sourceCell.value;
      }
    }
  }

  // Reproduce only data-area merges from the canonical renderer. Header merges
  // remain owned by the requested one-sheet template.
  const merges = Array.isArray(source.model?.merges) ? source.model.merges : [];
  for (const range of merges) {
    const match = String(range).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
    if (!match) continue;
    const startRow = Number(match[2]);
    const endRow = Number(match[4]);
    if (startRow < 6 || endRow < 6) continue;
    try {
      target.mergeCells(range);
    } catch (_) {}
  }

  target.autoFilter = source.autoFilter || target.autoFilter;
}

/**
 * GC must be exported from the Cắt lồng sheet of the requested template.
 * The repository template is allowed to contain the complete legacy workbook
 * (17 sheets). We keep only its Cắt lồng sheet, then inject canonical DB data
 * into that sheet. This preserves the requested visual template while ensuring
 * the legacy A+B / summary sheets never appear in the exported GC workbook.
 */
async function buildGcFromOneSheetTemplate(args, monthlyModule) {
  const source = args?.payload?.processes?.GC || {};
  const renderProcessSheet = monthlyModule?._private?.renderProcessSheet;
  const processConfig = monthlyModule?.PROCESS_SHEETS?.GC;

  if (typeof renderProcessSheet !== 'function' || !processConfig) {
    throw new Error('Thiếu renderer chuẩn để xuất template Cắt lồng một sheet.');
  }

  const templatePath = path.join(args.appPath, 'assets', 'templates', 'bao-cao-cat-long-export.xlsx');
  const started = Date.now();
  const yearMonth = String(args?.payload?.yearMonth || args?.date || '').slice(0, 7);
  const settings = args?.payload?.formulaSettings?.GC || args?.payload?.formulaSettings?.GLOBAL || {};

  log('BUILD_GC_ONE_SHEET_START', {
    date: args?.date,
    reportCount: Array.isArray(source.reports) ? source.reports.length : 0,
    templatePath,
    writer: 'bao-cao-cat-long-export.xlsx',
    renderer: 'monthlyWorkbookLocal.renderProcessSheet'
  });

  const templateWorkbook = new ExcelJS.Workbook();
  await templateWorkbook.xlsx.readFile(templatePath);

  // The committed template is a legacy 17-sheet workbook. Do not reject it:
  // locate the actual Cắt lồng sheet and reduce the workbook to that sheet.
  const sheet = findGcTemplateSheet(templateWorkbook);
  const originalTemplateSheetCount = templateWorkbook.worksheets.length;
  reduceWorkbookToSheet(templateWorkbook, sheet);

  // ExcelJS throws "Worksheet name already exists" when assigning a sheet its
  // current name because the workbook name setter also sees the current sheet.
  // Only rename when the surviving template sheet actually has a different
  // name. This also handles templates that already use the canonical name.
  if (sheet.name !== 'CẮT LỒNG') {
    sheet.name = 'CẮT LỒNG';
  }
  sheet.state = 'visible';

  // Render through the same canonical logic used by the normal monthly
  // exporter. This avoids duplicating row/column calculation logic here.
  const renderedWorkbook = new ExcelJS.Workbook();
  renderProcessSheet(renderedWorkbook, 'GC', processConfig, source, yearMonth, settings);
  const renderedSheet = renderedWorkbook.getWorksheet(processConfig.sheet);
  if (!renderedSheet) {
    throw new Error('Renderer chuẩn không tạo được sheet Cắt lồng.');
  }

  copyRenderedSheetIntoTemplate(sheet, renderedSheet);

  templateWorkbook.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];
  templateWorkbook.calcProperties.fullCalcOnLoad = true;
  templateWorkbook.calcProperties.forceFullCalc = true;
  templateWorkbook.calcProperties.calcMode = 'auto';

  const buffer = Buffer.from(await templateWorkbook.xlsx.writeBuffer());
  const elapsed = Date.now() - started;
  log('BUILD_GC_ONE_SHEET_DONE', {
    date: args?.date,
    reportCount: Array.isArray(source.reports) ? source.reports.length : 0,
    originalTemplateSheetCount,
    sheetCount: templateWorkbook.worksheets.length,
    rows: sheet.rowCount,
    columns: sheet.columnCount,
    elapsedMs: elapsed
  });

  return {
    buffer,
    result: { code: 'GC', sheet: 'CẮT LỒNG', reportCount: Array.isArray(source.reports) ? source.reports.length : 0 },
    processCode: 'GC',
    processName: 'CẮT/LỒNG',
    fileName: `04_CAT_LONG_${String(args.date || '').slice(5, 7)}-${String(args.date || '').slice(0, 4)}.xlsx`,
    reportCount: Array.isArray(source.reports) ? source.reports.length : 0,
    formulaReplacementCount: 0,
    templateKind: 'ONE_SHEET_GC_TEMPLATE'
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