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

  const partial = sheets.find((sheet) => normalizeSheetName(sheet.name).includes('CATLONG'));
  if (partial) return partial;

  throw new Error(
    `Không tìm thấy sheet Cắt lồng trong template GC. Các sheet hiện có: ${sheets.map((s) => s.name).join(', ')}`
  );
}

function reduceWorkbookToSheet(workbook, keepSheet) {
  for (const sheet of [...workbook.worksheets]) {
    if (sheet.id !== keepSheet.id) workbook.removeWorksheet(sheet.id);
  }
}

// ExcelJS cannot safely write a worksheet after its shared-formula master
// has disappeared (for example after reducing the 17-sheet template to the
// single Cắt lồng sheet). The template is the visual/layout authority; the
// actual production data is written by the canonical renderer below. Convert
// shared-formula clones to their cached value (or blank) before writeBuffer().
// Normal formulas are intentionally kept so the template can still provide
// calculations where ExcelJS can represent them safely.
function stripBrokenSharedFormulaClones(workbook) {
  let converted = 0;
  let cleared = 0;
  let formulaCleared = 0;

  for (const sheet of workbook.worksheets || []) {
    for (const row of sheet._rows || []) {
      for (const cell of row?._cells || []) {
        const model = cell?.model;
        if (!model) continue;

        if (model.sharedFormula) {
          const cached = model.result;
          cell.value = cached !== undefined && cached !== null ? cached : null;
          if (cell.model) delete cell.model.sharedFormula;
          converted += 1;
          if (cached === undefined || cached === null) cleared += 1;
          continue;
        }

        // The GC template is visual/form-oriented. Ordinary formulas are not
        // required for exported DB data and may still reference removed legacy
        // sheets. Preserve their cached result when available, otherwise blank.
        if (model.type === 6 || model.formula) {
          const cached = model.result;
          cell.value = cached !== undefined && cached !== null ? cached : null;
          formulaCleared += 1;
        }
      }
    }
  }

  log('TEMPLATE_FORMULA_SANITIZED', {
    sharedFormulaConverted: converted,
    sharedFormulaCleared: cleared,
    ordinaryFormulaCleared: formulaCleared,
    remainingSheets: workbook.worksheets.length
  });

  return { converted, cleared, formulaCleared };
}

function clearTemplateDataRows(sheet, firstDataRow, lastDataRow, maxColumns) {
  const first = Math.max(1, Number(firstDataRow) || 1);
  const last = Math.max(first, Number(lastDataRow) || first);
  const columns = Math.max(1, Number(maxColumns) || sheet.columnCount);

  for (let rowNumber = first; rowNumber <= last; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    for (let columnNumber = 1; columnNumber <= columns; columnNumber += 1) {
      row.getCell(columnNumber).value = null;
    }
  }
}

function writeValuePreserveTemplate(cell, value, sourceCell) {
  cell.value = value === undefined ? null : value;
  if (sourceCell?.numFmt) cell.numFmt = sourceCell.numFmt;
  if (sourceCell?.alignment) cell.alignment = { ...sourceCell.alignment };
}

function copyRenderedDataIntoTemplate(target, source) {
  const sourceFirstRow = 6;
  const sourceLastRow = Math.max(sourceFirstRow, source.rowCount);
  const sourceColumns = Math.max(1, source.columnCount);

  log('COPY_TEMPLATE_DATA_START', {
    sourceLastRow,
    targetLastRow: target.rowCount,
    sourceColumns,
    targetColumns: target.columnCount,
    maxColumns: sourceColumns
  });

  clearTemplateDataRows(target, sourceFirstRow, sourceLastRow, sourceColumns);
  log('COPY_TEMPLATE_DATA_CLEARED', {
    firstRow: sourceFirstRow,
    lastRow: sourceLastRow,
    columns: sourceColumns
  });

  for (let rowNumber = sourceFirstRow; rowNumber <= sourceLastRow; rowNumber += 1) {
    const sourceRow = source.getRow(rowNumber);
    const targetRow = target.getRow(rowNumber);
    if (sourceRow.height != null) targetRow.height = sourceRow.height;

    for (let columnNumber = 1; columnNumber <= sourceColumns; columnNumber += 1) {
      const sourceCell = source.getCell(rowNumber, columnNumber);
      const value = sourceCell?.value;
      if (value !== null && value !== undefined) {
        writeValuePreserveTemplate(target.getCell(rowNumber, columnNumber), value, sourceCell);
      }
    }
  }

  const sourceMerges = Array.isArray(source.model?.merges) ? source.model.merges : [];
  for (const range of sourceMerges) {
    const match = String(range).match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
    if (!match) continue;
    const startRow = Number(match[2]);
    const endRow = Number(match[4]);
    if (startRow < sourceFirstRow || endRow < sourceFirstRow) continue;
    try { target.mergeCells(range); } catch (_) {}
  }

  if (source.autoFilter) target.autoFilter = source.autoFilter;

  log('COPY_TEMPLATE_DATA_DONE', {
    sourceLastRow,
    targetLastRow: target.rowCount,
    maxColumns: sourceColumns
  });
  return { sourceLastRow, targetLastRow: target.rowCount, maxColumns: sourceColumns };
}

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
    renderer: 'monthlyWorkbookLocal.renderProcessSheet'
  });

  const templateWorkbook = new ExcelJS.Workbook();
  log('TEMPLATE_READ_START', { templatePath });
  await templateWorkbook.xlsx.readFile(templatePath);
  log('TEMPLATE_READ_DONE', { sheetCount: templateWorkbook.worksheets.length });

  const sheet = findGcTemplateSheet(templateWorkbook);
  const originalTemplateSheetCount = templateWorkbook.worksheets.length;
  log('TEMPLATE_GC_SHEET_FOUND', { sheet: sheet.name, originalTemplateSheetCount });

  log('TEMPLATE_REDUCE_START', { sheetCount: templateWorkbook.worksheets.length });
  reduceWorkbookToSheet(templateWorkbook, sheet);
  log('TEMPLATE_REDUCE_DONE', { sheetCount: templateWorkbook.worksheets.length, sheet: sheet.name });

  // The template supplies layout only. Remove shared and ordinary formula state
  // because the actual exported values are computed by the DB/renderer and then
  // written into the form. This prevents ExcelJS from resolving legacy formulas.
  const formulaStats = stripBrokenSharedFormulaClones(templateWorkbook);
  sheet.state = 'visible';

  const renderedWorkbook = new ExcelJS.Workbook();
  log('CANONICAL_RENDER_START', { reportCount: Array.isArray(source.reports) ? source.reports.length : 0 });
  renderProcessSheet(renderedWorkbook, 'GC', processConfig, source, yearMonth, settings);
  log('CANONICAL_RENDER_DONE', { sheetCount: renderedWorkbook.worksheets.length });

  const renderedSheet = renderedWorkbook.getWorksheet(processConfig.sheet);
  if (!renderedSheet) throw new Error('Renderer chuẩn không tạo được sheet Cắt lồng.');

  const copyStats = copyRenderedDataIntoTemplate(sheet, renderedSheet);

  templateWorkbook.views = [{ activeTab: 0, firstSheet: 0, visibility: 'visible' }];
  templateWorkbook.calcProperties.fullCalcOnLoad = true;
  templateWorkbook.calcProperties.forceFullCalc = true;
  templateWorkbook.calcProperties.calcMode = 'auto';

  log('TEMPLATE_WRITE_START', {
    sheetCount: templateWorkbook.worksheets.length,
    rows: sheet.rowCount,
    columns: sheet.columnCount,
    sharedFormulaConverted: formulaStats.converted
  });
  const buffer = Buffer.from(await templateWorkbook.xlsx.writeBuffer());
  log('TEMPLATE_WRITE_DONE', { bytes: buffer.length });

  log('BUILD_GC_ONE_SHEET_DONE', {
    date: args?.date,
    reportCount: Array.isArray(source.reports) ? source.reports.length : 0,
    originalTemplateSheetCount,
    sheetCount: templateWorkbook.worksheets.length,
    rows: sheet.rowCount,
    columns: sheet.columnCount,
    sourceLastRow: copyStats.sourceLastRow,
    sharedFormulaConverted: formulaStats.converted,
    sharedFormulaCleared: formulaStats.cleared,
    elapsedMs: Date.now() - started
  });

  return {
    buffer,
    result: { code: 'GC', sheet: sheet.name, reportCount: Array.isArray(source.reports) ? source.reports.length : 0 },
    processCode: 'GC',
    processName: 'CẮT/LỒNG',
    fileName: `04_CAT_LONG_${String(args.date || '').slice(5, 7)}-${String(args.date || '').slice(0, 4)}.xlsx`,
    reportCount: Array.isArray(source.reports) ? source.reports.length : 0,
    formulaReplacementCount: formulaStats.converted,
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
    return processCode === 'GC' ? buildGcFromOneSheetTemplate(args, mod) : original(args);
  };

  mod.buildSplitMonthlyWorkbooksLocal = async (args) => {
    const processes = [];
    for (const [code, data] of Object.entries(args?.payload?.processes || {})) {
      if (!Array.isArray(data?.reports) || !data.reports.length) continue;
      processes.push(await mod.buildProcessWorkbookLocal({ ...args, processCode: code }));
    }
    return { summary: null, processes };
  };

  Object.defineProperty(mod, '__ktcV3MonthlyPatched', { value: true });
  log('MONTHLY_PATCH_INSTALLED_V3_ONE_SHEET_GC');
  return mod;
}

Module._load = function(request, parent, isMain) {
  const loaded = originalLoad.call(this, request, parent, isMain);
  if (typeof request === 'string' && /monthlyWorkbookLocal\.cjs$/.test(request)) return patchMonthly(loaded);
  return loaded;
};

log('EXCEL_EXPORT_V3_READY_ONE_SHEET_GC');
