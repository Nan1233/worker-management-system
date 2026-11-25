'use strict';
const { asText, asNumber, asInteger, dateKey } = require('./monthlyWorkbookValues.cjs');
const { detailId, detailValue, processDetailTypes } = require('./monthlyWorkbookDetails.cjs');
const { makeColumns } = require('./monthlyWorkbookColumns.cjs');
const { calculateProductionMetrics } = require('./productionCalculationEngine.cjs');
const { sortReports } = require('./monthlyWorkbookReportData.cjs');
const { FORMS: ORIGINAL_KTC_FORMS, WORKBOOK1_FORMS } = require('./originalProcessExcelTemplate.cjs');
const { createPhysicalMachineMetadata } = require('./monthlyWorkbookPhysicalEvents.cjs');
const { EXCEL_SYNC_CONTRACT_VERSION } = require(typeof process.resourcesPath === 'string' && require('node:fs').existsSync(require('node:path').join(process.resourcesPath, 'shared', 'excelSyncContract.cjs')) ? require('node:path').join(process.resourcesPath, 'shared', 'excelSyncContract.cjs') : '../../shared/excelSyncContract.cjs');

const GC_HELPER_SHEET = 'TAY MÁY CẮT LỒNG';

function typeIdFromSyncKey(key) {
  const match = String(key || '').match(/^id:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function syncOriginalPatch(report) {
  return {
    shift: asText(report.shift),
    operation_type: asText(report.operation_type),
    operation_mode: asText(report.operation_mode),
    machine_no: asText(report.machine_no),
    product_name: asText(report.product_name),
    training_percent: calculateProductionMetrics(report).trainingPercent,
    actual_time: asNumber(report.actual_time),
    tt_ok: asInteger(report.tt_ok),
    note: asText(report.note),
    deductions: (report.deductions || []).map((item) => ({
      deduction_type_id: detailId(item, 'deduction'),
      hours: detailValue(item, 'deduction') || 0
    })).filter((item) => item.deduction_type_id),
    defects: (report.defects || []).map((item) => ({
      defect_type_id: detailId(item, 'defect'),
      quantity: detailValue(item, 'defect') || 0
    })).filter((item) => item.defect_type_id)
  };
}

const { addPhysicalMachineEventsMetadata } = createPhysicalMachineMetadata({ asText, asNumber });

function addExcelDbSyncMetadata(workbook, code, processConfig, processData, yearMonth, templateMapping = null, renderedRows = null) {
  const deductionTypes = processDetailTypes(code, processData, 'deductionTypes', 'deductions', 'deduction');
  const defectTypes = processDetailTypes(code, processData, 'defectTypes', 'defects', 'defect');
  const columns = makeColumns(code, deductionTypes, defectTypes);
  const editable = (templateMapping || columns.map((column, index) => ({ ...column, index: index + 1 }))).map((column) => {
    const entry = { index: column.index, key: column.key, header: column.header };
    if (column.key.startsWith('deduction:')) entry.typeId = typeIdFromSyncKey(column.key.slice('deduction:'.length));
    if (column.key.startsWith('defect:')) entry.typeId = typeIdFromSyncKey(column.key.slice('defect:'.length));
    return entry;
  });
  // The six approved Workbook1 paper forms have no visible ID column.
  // Store an exact row-to-report mapping in veryHidden metadata, preserving
  // the user-approved sheet widths, column count, headers and printed layout.
  const paperForm = WORKBOOK1_FORMS[code] || ORIGINAL_KTC_FORMS[code] || null;
  const sourceFirstDataRow = paperForm ? paperForm.first + (WORKBOOK1_FORMS[code] ? 0 : 1) : null;
  const reportRows = new Map();
  const reportOrdinals = new Map();
  if (paperForm) {
    // Do not re-sort reports or independently reconstruct row coordinates.
    // The renderer records the exact identity of each actual written row.
    if (!(renderedRows instanceof Map)) throw new Error('Thiếu ánh xạ dòng từ bộ dựng Excel.');
    for (const report of processData?.reports || []) {
      const id=Number(report.id), identity=renderedRows.get(id);
      if(!identity || !Number.isSafeInteger(identity.row) || identity.row<sourceFirstDataRow || !identity.day || identity.stt<1 || reportRows.has(id)) {
        throw new Error('Ánh xạ dòng Excel không hợp lệ cho báo cáo '+id);
      }
      reportRows.set(id,identity.row);
      reportOrdinals.set(id,identity.stt);
    }
  }
  const sheet = workbook.addWorksheet('_KTC_SYNC');
  sheet.state = 'veryHidden';
  sheet.getCell('A1').value = JSON.stringify({
    version: EXCEL_SYNC_CONTRACT_VERSION,
    processCode: code,
    sheetName: templateMapping && paperForm ? paperForm.sheet : processConfig.sheet,
    generatedAt: new Date().toISOString(),
    yearMonth,
    gcHelperSheet: code === 'GC' ? GC_HELPER_SHEET : null,
    rowIdentityMode: paperForm ? 'KTC_SYNC_ROW_V1' : null,
    firstDataRow: sourceFirstDataRow,
    columns: editable
  });
  sheet.addRow(['report_id', 'expected_updated_at', 'operation_mode', 'original_json', 'source_row', 'worker_code', 'work_date', 'row_stt']);
  for (const report of processData?.reports || []) {
    sheet.addRow([
      Number(report.id),
      report.updated_at || report.created_at || null,
      asText(report.operation_mode).toUpperCase(),
      JSON.stringify(syncOriginalPatch(report)),
      paperForm ? reportRows.get(Number(report.id)) ?? null : null,
      paperForm ? asText(report.worker_code) : null,
      paperForm ? renderedRows.get(Number(report.id)).day : null,
      paperForm ? reportOrdinals.get(Number(report.id)) ?? null : null
    ]);
  }
}

module.exports = { typeIdFromSyncKey, syncOriginalPatch, addPhysicalMachineEventsMetadata, addExcelDbSyncMetadata };
