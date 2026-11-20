const ExcelJS = require('exceljs');
const { PROCESS_SHEETS, PROCESS_TEMPLATE_SCHEMAS } = require('./monthlyWorkbookSchemas.cjs');
const { PROCESS_FILE_PREFIXES, processWorkbookFileName, summaryWorkbookFileName } = require('./monthlyWorkbookNaming.cjs');
const { createPhysicalMachineMetadata } = require('./monthlyWorkbookPhysicalEvents.cjs');
const { FORMS: ORIGINAL_KTC_FORMS, WORKBOOK1_FORMS, renderOriginalProcessTemplate } = require('./originalProcessExcelTemplate.cjs');
const { calculateProductionMetrics, DEFAULT_SETTINGS, trainingFactor, calculateNg } = require('./productionCalculationEngine.cjs');
const { EXCEL_SYNC_CONTRACT_VERSION } = require(typeof process.resourcesPath === 'string' && require('node:fs').existsSync(require('node:path').join(process.resourcesPath, 'shared', 'excelSyncContract.cjs')) ? require('node:path').join(process.resourcesPath, 'shared', 'excelSyncContract.cjs') : '../../shared/excelSyncContract.cjs');

const EXCEL_CONTRACT_VERSION = EXCEL_SYNC_CONTRACT_VERSION;

// KTC Excel color contract: bám hệ màu file tháng 07/2026.
// Tất cả mã màu được quản lý tập trung tại đây; không rải mã màu trực tiếp trong code.
const { COLORS } = require('./monthlyWorkbookStyles.cjs');
const { createGcModeHelper } = require('./monthlyWorkbookGcHelper.cjs');
const { createMonthlySummarySheets } = require('./monthlyWorkbookSummarySheets.cjs');
const { createProcessSheetRenderer } = require('./monthlyWorkbookProcessSheet.cjs');

const { asText, asNumber, asInteger, NUMBER_FORMATS, resolvedNumberFormat,
  asDate, asDateTime, normalize, pad2, dateKey } = require('./monthlyWorkbookValues.cjs');

const {
  assertApprovedDatabasePayload, countedNg, reportTimeKey, formulaSettingsFor,
  reportSnapshot, achievementColor, parseExtraData, rowValues, sortReports,
  settingsForReport, headerFontSize,
} = require('./monthlyWorkbookReportData.cjs');

const {
  detailId, detailKey, reportDetailItems, processDetailTypes, detailValue, detailMap,
} = require('./monthlyWorkbookDetails.cjs');

const { thinBorder, solidFill, applyAllBorders, applyCellStyle } = require('./monthlyWorkbookCellStyles.cjs');

const { addCover } = require('./monthlyWorkbookCover.cjs');

const { makeColumns, groupStyle, setGroupHeader } = require('./monthlyWorkbookColumns.cjs');

const { renderProcessSheet } = createProcessSheetRenderer({
  processDetailTypes, makeColumns, sortReports, settingsForReport, rowValues,
  setGroupHeader, groupStyle, achievementColor, applyCellStyle, applyAllBorders,
  asDate, asText, dateKey, headerFontSize, pad2, resolvedNumberFormat,
  solidFill, thinBorder,
});

const { addSummary, addReconciliationSheet } = createMonthlySummarySheets({
  applyCellStyle, applyAllBorders, sortReports, formulaSettingsFor,
  settingsForReport, reportSnapshot, reportDetailItems, detailValue,
});

const GC_HELPER_SHEET = 'TAY MÁY CẮT LỒNG';

const { addGcModeHelperSheet } = createGcModeHelper({ applyCellStyle, solidFill, applyAllBorders });

const { addPhysicalMachineEventsMetadata, addExcelDbSyncMetadata } = require('./monthlyWorkbookSyncMetadata.cjs');

async function buildMonthlyWorkbookLocal({ date, payload }) {
  assertApprovedDatabasePayload(payload);
  const yearMonth = String(payload.yearMonth || date || '').slice(0, 7);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  workbook.modified = new Date();
  addCover(workbook, yearMonth, payload.diagnostics);
  addSummary(workbook, payload, yearMonth);
  const results = [];
  for (const [code, config] of Object.entries(PROCESS_SHEETS)) {
    results.push(renderProcessSheet(workbook, code, config, payload.processes?.[code] || {}, yearMonth, formulaSettingsFor(payload, code)));
  }
  addReconciliationSheet(workbook, payload);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, results, formulaReplacementCount: 0 };
}


/**
 * Tạo một workbook chỉ chứa đúng một sheet công đoạn.
 * Dùng cho Desktop để mỗi công đoạn là một file Excel độc lập, nhẹ và dễ mở/chỉnh.
 */
async function buildProcessWorkbookLocal({ date, payload, processCode, onTemplateLoaded }) {
  assertApprovedDatabasePayload(payload);
  const code = String(processCode || '').trim().toUpperCase();
  const config = PROCESS_SHEETS[code];
  if (!config) throw new Error(`Công đoạn không hợp lệ: ${processCode}`);

  const yearMonth = String(payload.yearMonth || date || '').slice(0, 7);
  const processData = payload.processes?.[code] || {};
  if (WORKBOOK1_FORMS[code] || ORIGINAL_KTC_FORMS[code]) {
    const original = await renderOriginalProcessTemplate({
      ExcelJS, code, processData, yearMonth, settings: formulaSettingsFor(payload,code),
      helpers: { sortReports, dateKey, processDetailTypes, reportSnapshot, settingsForReport,
        parseExtraData, detailMap, reportDetailItems }, onTemplateLoaded
    });
    if (code === 'GC' && WORKBOOK1_FORMS[code]) {
      // Preserve the machine/manual editing helper for the new GC worksheet.
      // Its row 6 references match Workbook1's row 5 date separator + first report.
      const mappedColumns = Array.from({ length: Math.max(...original.mapping.map(x => x.index)) },
        (_, index) => ({ key: original.mapping.find(field => field.index === index + 1)?.key || '' }));
      addGcModeHelperSheet(original.workbook, original.sheet, processData, mappedColumns);
    }
    addExcelDbSyncMetadata(original.workbook, code, config, processData, yearMonth, original.mapping);
    addPhysicalMachineEventsMetadata(original.workbook, processData);
    const buffer = Buffer.from(await original.workbook.xlsx.writeBuffer());
    const originalCols = {};
    for (const field of original.mapping || []) {
      if (typeof field.key === 'string' && !field.key.startsWith('defect:') && !field.key.startsWith('deduction:') && originalCols[field.key] == null) {
        originalCols[field.key] = field.index;
      }
    }
    return {buffer, result:original.result, processCode:code, processName:config.title,
      fileName:processWorkbookFileName(code,date,payload), formulaReplacementCount:0,
      templateKind:WORKBOOK1_FORMS[code] ? "workbook1-sheet" : "original-company", columnContract:{cols:originalCols}};
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  workbook.modified = new Date();
  const result = renderProcessSheet(
    workbook,
    code,
    config,
    processData,
    yearMonth,
    formulaSettingsFor(payload, code)
  );
  if (code === 'GC') {
    const deductionTypes = processDetailTypes(code, processData, 'deductionTypes', 'deductions', 'deduction');
    const defectTypes = processDetailTypes(code, processData, 'defectTypes', 'defects', 'defect');
    addGcModeHelperSheet(workbook, workbook.getWorksheet(config.sheet), processData, makeColumns(code, deductionTypes, defectTypes));
  }
  addExcelDbSyncMetadata(workbook, code, config, processData, yearMonth);
  addPhysicalMachineEventsMetadata(workbook, processData);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    result,
    processCode: code,
    processName: config.title,
    fileName: processWorkbookFileName(code, date, payload),
    formulaReplacementCount: 0
  };
}

/**
 * File số 00: chỉ giữ thông tin chung của tháng. Các sheet công đoạn được tách
 * hoàn toàn sang 10 file riêng để không phải mở một workbook quá rộng/nặng.
 */
async function buildMonthlySummaryWorkbookLocal({ date, payload }) {
  assertApprovedDatabasePayload(payload);
  const yearMonth = String(payload.yearMonth || date || '').slice(0, 7);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  workbook.created = new Date();
  workbook.modified = new Date();
  addCover(workbook, yearMonth, payload.diagnostics);
  addSummary(workbook, payload, yearMonth);
  addReconciliationSheet(workbook, payload);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return {
    buffer,
    fileName: summaryWorkbookFileName(date, payload),
    formulaReplacementCount: 0
  };
}

async function buildSplitMonthlyWorkbooksLocal({ date, payload, onTemplateLoaded }) {
  assertApprovedDatabasePayload(payload);
  const summary = await buildMonthlySummaryWorkbookLocal({ date, payload });
  const processes = [];
  for (const code of Object.keys(PROCESS_SHEETS)) {
    processes.push(await buildProcessWorkbookLocal({ date, payload, processCode: code, onTemplateLoaded }));
  }
  return { summary, processes };
}

const { buildReconciliationWorkbook } = require('./monthlyWorkbookReconciliation.cjs');

module.exports = {
  buildMonthlyWorkbookLocal,
  // Stable unwrapped entry point consumed by excelExportContractPatch.v6.cjs.
  buildCompanyOriginalProcessWorkbookLocal: buildProcessWorkbookLocal,
  buildProcessWorkbookLocal,
  buildMonthlySummaryWorkbookLocal,
  buildSplitMonthlyWorkbooksLocal,
  buildReconciliationWorkbook,
  PROCESS_SHEETS,
  PROCESS_FILE_PREFIXES,
  EXCEL_CONTRACT_VERSION,
  processWorkbookFileName,
  summaryWorkbookFileName,
  _private: {
    assertApprovedDatabasePayload,
    normalize,
    reportSnapshot,
    reportDetailItems,
    detailKey,
    processDetailTypes,
    makeColumns,
    renderProcessSheet,
    sortReports,
    trainingFactor,
    countedNg,
    reportTimeKey,
    applyAllBorders,
    addPhysicalMachineEventsMetadata,
    COLORS
  }
};
