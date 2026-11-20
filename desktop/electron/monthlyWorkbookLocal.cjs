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

const { createMonthlyWorkbookBuilders } = require('./monthlyWorkbookBuilders.cjs');
const {
  buildMonthlyWorkbookLocal, buildProcessWorkbookLocal,
  buildMonthlySummaryWorkbookLocal, buildSplitMonthlyWorkbooksLocal,
} = createMonthlyWorkbookBuilders({
  assertApprovedDatabasePayload, formulaSettingsFor, addCover, addSummary,
  addReconciliationSheet, renderProcessSheet, sortReports, dateKey,
  processDetailTypes, reportSnapshot, settingsForReport, parseExtraData,
  detailMap, reportDetailItems, addGcModeHelperSheet, addExcelDbSyncMetadata,
  addPhysicalMachineEventsMetadata, makeColumns,
});

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
