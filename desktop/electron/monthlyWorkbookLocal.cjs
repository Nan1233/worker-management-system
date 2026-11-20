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

function assertApprovedDatabasePayload(payload) {
  if (!payload || payload.dataSource !== 'tidb.production_reports.approved') {
    throw new Error('Excel chỉ được xuất từ production_reports đã duyệt trong TiDB.');
  }
  for (const [code, data] of Object.entries(payload.processes || {})) {
    for (const report of data?.reports || []) {
      if (report?.dataSource !== 'production_reports' || report?.isApprovedDatabaseRecord !== true) {
        throw new Error(`Báo cáo ${report?.id || '?'} của ${code} không phải dữ liệu đã duyệt từ TiDB.`);
      }
    }
  }
}

function machineDisplay(report) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const values = lines
    .map((item) => asText(item.machine_code || item.machine_no || item.machine_name))
    .filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : asText(report.machine_no);
}

function productDisplay(report) {
  const lines = Array.isArray(report.machineLines) ? report.machineLines : [];
  const values = lines.map((item) => asText(item.product_code)).filter(Boolean);
  return values.length ? [...new Set(values)].join(', ') : (asText(report.product_code) || asText(report.product_name));
}

function countedNg(report) {
  return calculateNg(report).countedNg;
}

function reportTimeKey(report) {
  return asText(report.approved_at || report.created_at || report.entry_date || report.work_date);
}

function formulaSettingsFor(payload, processCode) {
  const source = payload?.formulaSettings || {};
  return source[String(processCode || '').toUpperCase()] || source.GLOBAL || DEFAULT_SETTINGS;
}

function excelOperationTypeLabel(value) {
  const text = asText(value).toUpperCase();
  if (['CUT', 'CẮT', 'CAT'].includes(text)) return 'CẮT';
  if (['NEST', 'NESTING', 'LỒNG', 'LONG'].includes(text)) return 'LỒNG';
  return asText(value);
}

function excelOperationModeLabel(value) {
  const text = asText(value).toUpperCase();
  if (['MACHINE', 'MÁY', 'MAY'].includes(text)) return 'MÁY';
  if (['MANUAL', 'TAY', 'THỦ CÔNG', 'THU CONG'].includes(text)) return 'TAY';
  return asText(value);
}

function reportSnapshot(report, settings = {}) {
  const metrics = report.calculationSnapshot || calculateProductionMetrics(report, settings);
  return {
    id: asNumber(report.id),
    date: asDate(report.work_date),
    entryDate: asDateTime(report.created_at),
    workerCode: asText(report.worker_code),
    workerName: asText(report.full_name),
    shift: asText(report.shift),
    operationType: excelOperationTypeLabel(report.operation_type),
    operationMode: excelOperationModeLabel(report.operation_mode),
    machine: machineDisplay(report),
    product: productDisplay(report),
    training: metrics.trainingFactor,
    standard: metrics.standard,
    workingTime: metrics.workingTime,
    actualTime: metrics.actualTime,
    deductionTime: metrics.deductionTime,
    ok: metrics.ok,
    ng: metrics.allNg,
    countedNg: metrics.countedNg,
    enteredOutput: metrics.enteredOutput,
    output: metrics.adjustedOutput,
    outputPerHour: metrics.outputPerHour,
    achievement: metrics.achievement,
    ngRate: metrics.ngRate,
    status: asText(report.status),
    note: asText(report.note)
  };
}

function achievementColor(value, settings) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const percentValue = Number(value) * 100;
  // Quy tắc màu thống nhất: >=100% xanh; 90-<100% vàng; <90% cam đỏ.
  if (percentValue >= 100) return COLORS.rateGood;
  if (percentValue >= 90) return COLORS.rateWarning;
  return COLORS.rateBad;
}

const {
  detailId, detailKey, reportDetailItems, processDetailTypes, detailValue, detailMap,
} = require('./monthlyWorkbookDetails.cjs');

const { thinBorder, solidFill, applyAllBorders, applyCellStyle } = require('./monthlyWorkbookCellStyles.cjs');

function addCover(workbook, yearMonth, diagnostics) {
  const [year, month] = yearMonth.split('-');
  const sheet = workbook.addWorksheet('BÌA', { views: [{ showGridLines: false }] });
  sheet.columns = Array.from({ length: 12 }, () => ({ width: 12 }));
  sheet.mergeCells('B3:L5');
  sheet.getCell('B3').value = 'BÁO CÁO SẢN XUẤT THÁNG';
  applyCellStyle(sheet.getCell('B3'), { fill: COLORS.navy, fontColor: COLORS.white, bold: true, size: 22, border: false });
  sheet.mergeCells('B6:L7');
  sheet.getCell('B6').value = `THÁNG ${month}/${year}`;
  applyCellStyle(sheet.getCell('B6'), { fill: COLORS.blue, fontColor: COLORS.white, bold: true, size: 18, border: false });

  const totalReports = Object.values(diagnostics || {}).reduce((sum, item) => sum + Number(item?.reports || 0), 0);
  const activeProcesses = Object.values(diagnostics || {}).filter((item) => Number(item?.reports || 0) > 0).length;
  const info = [
    ['Nguồn dữ liệu', 'TiDB - production_reports đã duyệt'],
    ['Số báo cáo', totalReports],
    ['Công đoạn có dữ liệu', `${activeProcesses}/9`],
    ['Ngày tạo file', new Date()]
  ];
  info.forEach(([label, value], index) => {
    const row = 10 + index;
    sheet.mergeCells(row, 3, row, 5);
    sheet.mergeCells(row, 6, row, 10);
    sheet.getCell(row, 3).value = label;
    sheet.getCell(row, 6).value = value;
    applyCellStyle(sheet.getCell(row, 3), { fill: COLORS.blueLight, bold: true, align: 'left' });
    applyCellStyle(sheet.getCell(row, 6), { fill: COLORS.white, align: 'left' });
    if (value instanceof Date) sheet.getCell(row, 6).numFmt = 'dd/mm/yyyy hh:mm';
  });
  sheet.mergeCells('C16:J18');
  sheet.getCell('C16').value = 'File được tạo tự động từ dữ liệu quản lý đã duyệt. Không sử dụng dữ liệu minh họa trong file mẫu.';
  applyCellStyle(sheet.getCell('C16'), { fill: COLORS.grayLight, bold: false, align: 'center', border: false });
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } };
  return sheet;
}

const { makeColumns, groupStyle, setGroupHeader } = require('./monthlyWorkbookColumns.cjs');

function parseExtraData(report) {
  if (!report?.extra_data) return {};
  if (typeof report.extra_data === 'object' && !Array.isArray(report.extra_data)) return report.extra_data;
  try { const value = JSON.parse(String(report.extra_data)); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
}

function rowValues(processCode, report, deductionTypes, defectTypes, settings) {
  const snapshot = reportSnapshot(report, settings);
  const deductions = detailMap(reportDetailItems(report, processCode, 'deduction'), 'deduction');
  const defects = detailMap(reportDetailItems(report, processCode, 'defect'), 'defect');
  const extra = parseExtraData(report);
  const values = {
    ...snapshot,
    stt: null
  };
  for (const field of PROCESS_TEMPLATE_SCHEMAS[processCode]?.extras || []) {
    const raw = extra[field.key];
    values[`extra:${field.key}`] = field.kind === 'integer' ? asInteger(raw) : field.kind === 'decimal' ? asNumber(raw) : field.kind === 'date' ? asDate(raw) : asText(raw);
  }
  deductionTypes.forEach((type) => {
    const value = [type.key, ...(type.aliases || [])]
      .map((key) => deductions.get(key))
      .find((item) => item !== undefined);
    values[`deduction:${type.key}`] = value || 0;
  });
  defectTypes.forEach((type) => {
    const value = [type.key, ...(type.aliases || [])]
      .map((key) => defects.get(key))
      .find((item) => item !== undefined);
    values[`defect:${type.key}`] = value || 0;
  });
  return values;
}

function compareReportsForWorkbook(left, right) {
  return dateKey(left.work_date).localeCompare(dateKey(right.work_date))
    || reportTimeKey(left).localeCompare(reportTimeKey(right))
    || asText(left.worker_code).localeCompare(asText(right.worker_code), undefined, { numeric: true })
    || machineDisplay(left).localeCompare(machineDisplay(right), undefined, { numeric: true })
    || Number(left.id || 0) - Number(right.id || 0);
}

function sortReports(reports) {
  // Do not mutate the caller's report order.
  return [...(reports || [])].sort(compareReportsForWorkbook);
}

function settingsForReport(report, fallback = {}, settingsByDate = {}) {
  const key = dateKey(report?.work_date);
  return (key && settingsByDate && settingsByDate[key]) || fallback || {};
}

function headerFontSize(header) {
  const length = asText(header).length;
  if (length <= 5) return 8;
  if (length <= 10) return 7.5;
  if (length <= 16) return 7;
  if (length <= 22) return 6.5;
  return 6;
}

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
    training_percent: Number.isFinite(Number(report.training_percent)) ? Number(report.training_percent) : 100,
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

function addExcelDbSyncMetadata(workbook, code, processConfig, processData, yearMonth, templateMapping = null) {
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
    let nextRow = sourceFirstDataRow - 2;
    let lastDate = null;
    let dayStt = 0;
    for (const report of sortReports(processData?.reports || [])) {
      const day = dateKey(report.work_date);
      if (day !== lastDate) { nextRow += 1; lastDate = day; dayStt = 0; }
      const id = Number(report.id);
      reportRows.set(id, ++nextRow);
      reportOrdinals.set(id, ++dayStt);
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
      paperForm ? dateKey(report.work_date) : null,
      paperForm ? reportOrdinals.get(Number(report.id)) ?? null : null
    ]);
  }
}

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

async function buildReconciliationWorkbook({ date, payload }) {
  assertApprovedDatabasePayload(payload);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'KTC Production Control';
  const sheet = workbook.addWorksheet('DATA_DB', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = ['Công đoạn','ID','Ngày báo cáo','Ngày nhập','Mã NV','Tên NV','Ca','Máy','Mã SP','% học việc','Định mức','Tổng thời gian','Thời gian thực tế','Tổng thời gian trừ','OK','NG','SP công nhân nhập','Tổng SP quy đổi','Trừ giờ JSON','NG JSON','Máy JSON','Trạng thái','Ghi chú'];
  sheet.addRow(headers);
  headers.forEach((_, index) => {
    applyCellStyle(sheet.getCell(1, index + 1), { fill: COLORS.navy, fontColor: COLORS.white, bold: true });
    sheet.getColumn(index + 1).width = index >= 18 && index <= 20 ? 35 : [20,10,13,13,11,24,7,18,18,11,12,12,12,12,10,10,14,14][index] || 14;
  });
  let count = 0;
  for (const [code, config] of Object.entries(PROCESS_SHEETS)) {
    const processData = payload.processes?.[code] || {};
    const baseSettings = formulaSettingsFor(payload, code);
    for (const report of sortReports(processData.reports)) {
      const itemSettings = settingsForReport(report, baseSettings, processData.formulaSettingsByDate || {});
      const value = reportSnapshot(report, itemSettings);
      const row = sheet.addRow([config.title,value.id,value.date,value.entryDate,value.workerCode,value.workerName,value.shift,value.machine,value.product,value.training,value.standard,value.workingTime,value.actualTime,value.deductionTime,value.ok,value.ng,value.enteredOutput,value.output,JSON.stringify(report.deductions || []),JSON.stringify(report.defects || []),JSON.stringify(report.machineLines || []),report.status,value.note]);
      row.getCell(2).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(3).numFmt = NUMBER_FORMATS.DATE;
      row.getCell(4).numFmt = NUMBER_FORMATS.DATE;
      row.getCell(10).numFmt = NUMBER_FORMATS.PERCENT;
      row.getCell(11).numFmt = resolvedNumberFormat(value.standard, NUMBER_FORMATS.RATE);
      row.getCell(12).numFmt = resolvedNumberFormat(value.workingTime, NUMBER_FORMATS.DECIMAL);
      row.getCell(13).numFmt = resolvedNumberFormat(value.actualTime, NUMBER_FORMATS.DECIMAL);
      row.getCell(14).numFmt = resolvedNumberFormat(value.deductionTime, NUMBER_FORMATS.DECIMAL);
      row.getCell(15).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(16).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(17).numFmt = NUMBER_FORMATS.INTEGER;
      row.getCell(18).numFmt = NUMBER_FORMATS.INTEGER;
      row.eachCell((cell, column) => applyCellStyle(cell, { fill: count % 2 ? COLORS.blueLight : COLORS.white, align: [1,6,8,9,19,20,21,23].includes(column) ? 'left' : 'center' }));
      count += 1;
    }
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, count + 1), column: headers.length } };
  applyAllBorders(sheet, { fromRow: 1, toRow: Math.max(1, count + 1), fromCol: 1, toCol: headers.length });
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, rowCount: count };
}

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
