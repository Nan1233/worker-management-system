'use strict';

const ExcelJS = require('exceljs');
const { cloneExcelStyle } = require('./excelStyleClone.cjs');
const { resolveWorkerParticipationTimes } = require('./exportMachineTime.cjs');
const { calculateProductionMetrics } = require('./productionCalculationEngine.cjs');
const { settingsForReport } = require('./monthlyWorkbookReportData.cjs');
const { processWorkbookFileName } = require('./monthlyWorkbookNaming.cjs');
const { calculateDetailTotals } = require('./workerReportDetailTotals.cjs');

const { TEMPLATE_NAME, PROCESS_CODES, PROCESS_FILE_PREFIXES,
  DETAIL_ALIASES, GC_FORM_DEFECT_COLUMN_BY_CODE, TEMPLATE_COLUMN_ALIASES,
} = require('./workerReportTemplateRegistry.cjs');
const { getTemplateBuffer } = require('./workerReportTemplateLoader.cjs');
const normalize = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();
const { isNonProductWorkReport, normalizedWorkTypeLabel: cvkWorkTypeCode } = require('./nonProductWorkReport.cjs');

const number = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

function detailVariants(value) {
  const raw = normalize(value);
  if (!raw) return [];
  const variants = new Set([raw]);
  const compact = raw.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (compact) variants.add(compact);
  const strippedPrefix = compact.replace(/^(ded|def|deduction|defect)[_-]+/, '').replace(/[_-]+db$/, '');
  if (strippedPrefix) variants.add(strippedPrefix);
  const alias = DETAIL_ALIASES[raw] || DETAIL_ALIASES[compact] || DETAIL_ALIASES[strippedPrefix];
  if (alias) variants.add(normalize(alias));
  return [...variants];
}
function canonicalDetailKey(value) {
  return normalize(DETAIL_ALIASES[normalize(value)] || normalize(value));
}

function cellText(cell) {
  const value = cell?.value;
  if (value && typeof value === 'object') {
    if (value.result != null) return String(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((x) => String(x?.text ?? '')).join('');
  }
  return String(value ?? '');
}
function findHeader(sheet) {
  let best = null;
  for (let r = 1; r <= Math.min(sheet.rowCount, 80); r += 1) {
    const labels = [];
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const text = normalize(cellText(sheet.getRow(r).getCell(c)));
      if (text) labels.push(text);
    }
    const score = labels.reduce((sum, t) => sum + (t === 'stt' ? 5 : 0)
      + (t.includes('ngay') ? 2 : 0) + (t.includes('ma nv') || t.includes('ma nhan vien') || t.includes('ma so') ? 3 : 0)
      + (t.includes('ho ten') || t === 'ten' ? 3 : 0) + (t === 'ca' ? 2 : 0)
      + (t.includes('may') ? 2 : 0) + (t.includes('thoi gian') ? 2 : 0), 0);
    if (!best || score > best.score) best = { row: r, score };
  }
  if (!best || best.score < 7) throw Object.assign(new Error('Không nhận diện được hàng tiêu đề của template công nhân'), { code: 'KTC_WORKER_TEMPLATE_HEADER_NOT_FOUND' });
  return best.row;
}
function findColumnMap(sheet, headerRow) {
  const map = new Map();
  for (let c = 1; c <= sheet.columnCount; c += 1) {
    const label = normalize(cellText(sheet.getRow(headerRow).getCell(c)));
    if (label) map.set(c, label);
  }
  return map;
}
function findColumn(map, predicates) {
  for (const [column, label] of map.entries()) if (predicates.every((p) => p(label))) return column;
  return null;
}
function pick(map, ...terms) {
  return findColumn(map, terms.map((term) => (label) => label.includes(normalize(term))));
}
function pickExact(map, ...terms) {
  const targets = terms.map(normalize);
  for (const [column, label] of map.entries()) if (targets.includes(label)) return column;
  return null;
}
// Excel stores dates without a timezone. Always emit the calendar day as UTC
// midnight so Windows (UTC+7) never shifts 05/09 to 04/09. A timestamp coming
// from the API is read as a Vietnam (UTC+7) calendar day.
function asDate(value) {
  if (!value) return null;
  const text = typeof value === 'string' ? value.trim() : '';
  const plain = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (plain) return new Date(Date.UTC(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3])));
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const vn = new Date(date.getTime() + 7 * 3600 * 1000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
}
// Convert database timestamps to the Vietnam wall-clock value stored in Excel.
function asSubmissionDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate(),
      value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds()));
  }
  const text = String(value).trim();
  const mysql = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (mysql) return new Date(Date.UTC(Number(mysql[1]), Number(mysql[2]) - 1, Number(mysql[3]),
    Number(mysql[4]), Number(mysql[5]), Number(mysql[6])));
  const iso = new Date(text);
  if (Number.isNaN(iso.getTime())) return null;
  const vn = new Date(iso.getTime() + 7 * 3600 * 1000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate(),
    vn.getUTCHours(), vn.getUTCMinutes(), vn.getUTCSeconds()));
}

const { createWorkerReportDetailMapping } = require('./workerReportDetailMapping.cjs');
const {
  detailItems, detailValue, typeLabel, itemKeys, resolveType, typeCandidates,
  encodedGcDefectCode, buildColumnContract,
} = createWorkerReportDetailMapping({
  number, normalize, detailVariants, canonicalDetailKey,
  pick, pickExact, findColumn, GC_FORM_DEFECT_COLUMN_BY_CODE, TEMPLATE_COLUMN_ALIASES,
});

function writeValue(row, column, value) { if (column) row.getCell(column).value = value == null ? null : value; }
function clearDataRows(sheet, startRow, count, columnCount) {
  for (let r = startRow; r < startRow + count; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= columnCount; c += 1) {
      const cell = row.getCell(c);
      if (cell.isMerged && cell.master?.row < startRow) continue;
      cell.value = null;
    }
  }
}

function writeDetailBlock(row, report, processData, assigned, kind) {
  const totals = calculateDetailTotals(report, processData, assigned, kind, {
    detailItems, detailValue, resolveType, itemKeys, typeCandidates,
    detailVariants, canonicalDetailKey,
  });
  for (const [column, total] of totals) row.getCell(column).value = total;
}

// Submission timestamp kept at Vietnam wall-clock time.
function asDateTime(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const plain = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (plain) return new Date(Date.UTC(+plain[1], +plain[2] - 1, +plain[3], +plain[4], +plain[5], +(plain[6] || 0)));
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + 7 * 3600 * 1000);
}

// Insert one column after `afterColumn` and shift every column reference the
// contract already holds. Lets the export add audit/derived columns without the
// template having to carry them.
function insertContractColumn(sheet, headerRow, contract, afterColumn, header, options = {}) {
  const anchor = Number(afterColumn || 0);
  if (!anchor) return null;
  const column = anchor + 1;
  sheet.spliceColumns(column, 0, []);
  const cell = sheet.getRow(headerRow).getCell(column);
  cell.style = cloneExcelStyle(sheet.getRow(headerRow).getCell(anchor).style || {});
  cell.value = header;
  sheet.getColumn(column).width = options.width || 14;
  if (options.hidden) sheet.getColumn(column).hidden = true;
  const shift = (value) => (Number(value) >= column ? Number(value) + 1 : value);
  for (const key of Object.keys(contract.cols)) if (contract.cols[key]) contract.cols[key] = shift(contract.cols[key]);
  for (const item of contract.deductions) item.column = shift(item.column);
  for (const item of contract.defects) item.column = shift(item.column);
  if (Array.isArray(contract.detailColumns)) contract.detailColumns = contract.detailColumns.map(shift);
  if (contract.lastColumn) contract.lastColumn = shift(contract.lastColumn);
  const previous = contract.shiftColumn;
  contract.shiftColumn = previous ? ((value) => shift(previous(value))) : shift;
  return column;
}

// Hidden submission timestamp right after STT, and a visible "% học việc"
// column between Tên and Máy. Both are derived from the DB, not the template.
function addDerivedColumns(sheet, headerRow, contract) {
  // The current template already carries both columns; only add what is missing.
  const headerKey = (column) => normalize(sheet.getRow(headerRow).getCell(column).value);
  let existingSubmitted = null;
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    if (headerKey(column).startsWith('thoi gian nop')) { existingSubmitted = column; break; }
  }
  if (existingSubmitted) {
    contract.cols.submittedAt = existingSubmitted;
    sheet.getColumn(existingSubmitted).hidden = true;
  } else {
    const submitted = insertContractColumn(sheet, headerRow, contract, contract.cols.stt,
      'Thời gian nộp báo cáo', { hidden: true, width: 18 });
    if (submitted) contract.cols.submittedAt = submitted;
  }
  if (!contract.cols.training) {
    const training = insertContractColumn(sheet, headerRow, contract, contract.cols.workerName,
      '% học việc', { width: 10 });
    if (training) contract.cols.training = training;
  }
}

function applyReportRow(row, report, contract, processData, index) {
  const set = (column, value) => writeValue(row, column, value);
  const exportTimes = resolveWorkerParticipationTimes(report);
  const reportForDetails = exportTimes.hasMachine
    ? { ...report, deductions: exportTimes.deductions }
    : report;
  set(contract.cols.stt, index + 1);
  set(contract.cols.entryDate, asSubmissionDateTime(report.submitted_at));
  if (contract.cols.entryDate) row.getCell(contract.cols.entryDate).numFmt = 'dd/mm/yyyy hh:mm:ss';
  set(contract.cols.date, asDate(report.work_date));
  set(contract.cols.workerCode, report.worker_code);
  set(contract.cols.workerName, report.full_name || report.worker_name || report.name);
  set(contract.cols.shift, report.shift);
  set(contract.cols.operationType, report.operation_type);
  set(contract.cols.operationMode, report.operation_mode);
  const machineLines = [
    ...(Array.isArray(report.machineLines) ? report.machineLines : []),
    ...(Array.isArray(report.machine_lines) ? report.machine_lines : []),
    ...(Array.isArray(report.machines) ? report.machines : [])
  ];
  const machineValues = [
    report.machine_no, report.machine_code, report.machine,
    ...machineLines.map((line) => line?.machine_code || line?.machine_no || line?.machineCode || line?.code)
  ].map((value) => String(value ?? '').trim()).filter(Boolean);
  set(contract.cols.machine, [...new Set(machineValues)].join(', '));
  // CVK is non-product work: the existing MSP/code column carries its
  // canonical work-type code, never a fabricated product code. If work_type
  // is absent, leave MSP blank rather than falling back to product/machine data.
  const workTypeCode = cvkWorkTypeCode(report);
  const isNonProductWork = isNonProductWorkReport(report);
  const directProduct = isNonProductWork
    ? workTypeCode
    : String(report.product_name || report.product_code || '').trim();
  const lineProducts = isNonProductWork ? [] : machineLines
    .map((line) => String(line?.product_code || line?.product_name || line?.productCode || '').trim())
    .filter(Boolean);
  set(contract.cols.product, directProduct || [...new Set(lineProducts)].join(', '));
  if (contract.cols.submittedAt) {
    const cell = row.getCell(contract.cols.submittedAt);
    cell.value = asSubmissionDateTime(report.submitted_at);
    cell.numFmt = 'dd/mm/yyyy hh:mm:ss';
  }
  const metrics = calculateProductionMetrics(report,settingsForReport(report,processData.formulaSettings||{},processData.formulaSettingsByDate||{}));
  const { plannedOutput: planned, trainingPercent } = metrics;
  if (contract.cols.training) {
    const cell = row.getCell(contract.cols.training);
    cell.value = trainingPercent == null ? null : trainingPercent / 100;
    cell.numFmt = '0%';
  }
  set(contract.cols.standard, planned);
  set(contract.cols.time, contract.timeKind === 'TOTAL' ? metrics.workingTime : metrics.actualTime);
  if (contract.cols.actualTime && contract.cols.actualTime !== contract.cols.time) set(contract.cols.actualTime, metrics.actualTime);
  set(contract.cols.deductionTotal, metrics.deductionTime);
  set(contract.cols.workTime, metrics.workingTime);
  set(contract.cols.ok, metrics.ok);
  set(contract.cols.ng, metrics.allNg);
  set(contract.cols.output, metrics.adjustedOutput);
  set(contract.cols.achievement, metrics.achievement);
  set(contract.cols.outputPerHour, metrics.outputPerHour);
  set(contract.cols.ngRate, metrics.ngRate);
  set(contract.cols.status, report.status);
  set(contract.cols.note, report.note || report.review_note);
  set(contract.cols.id, Number(report.id) || null);

  writeDetailBlock(row, reportForDetails, processData, contract.deductions, 'deduction');
  writeDetailBlock(row, report, processData, contract.defects, 'defect');
}

// A DB type that has no column in the template must not silently disappear.
// Append unmatched CAT/LONG form categories even when their monthly total is zero,
// so the exported sheet consistently reflects the 10 Cắt + 8 Lồng form catalogue.
function appendColumnsForUnmatchedTypes(sheet, headerRow, contract, reports, processData, processCode) {
  let next = Number(contract.lastColumn || sheet.columnCount) + 1;
  const headerSource = sheet.getRow(headerRow).getCell(Number(contract.lastColumn || sheet.columnCount));
  const blocks = [
    ['deduction', contract.unmatchedDeductionTypeObjects || [], contract.deductions, 'Trừ H'],
    ['defect', contract.unmatchedDefectTypeObjects || [], contract.defects, 'NG']
  ];
  for (const [kind, types, target, prefix] of blocks) {
    const used = new Set();
    for (const report of reports) {
      for (const item of detailItems(report, kind)) {
        if (!detailValue(item, kind)) continue;
        const type = resolveType(item, processData, kind);
        if (type && types.includes(type)) used.add(type);
      }
    }
    const labels = types.map((type) => typeLabel(type, kind));
    for (const type of types) {
      const encodedGcType = kind === 'defect' && Boolean(encodedGcDefectCode(type));
      const label = typeLabel(type, kind).trim();
      // Numeric placeholder types in the GC deduction catalogue are not
      // meaningful business categories (e.g. "Trừ H: 0", "Trừ H: 1").
      if (String(processCode || '').toUpperCase() === 'GC'
        && kind === 'deduction' && /^\d+(?:[.,]\d+)?$/.test(label)) continue;
      // GC must keep the fixed encoded 18-column defect catalogue. Never append
      // legacy/unmapped NG columns beside CAT01-CAT10 and LONG01-LONG08.
      if (String(processCode || '').toUpperCase() === 'GC' && kind === 'defect' && !encodedGcType) continue;
      if (!used.has(type) && !encodedGcType) continue;
      const duplicate = labels.filter((x) => String(x).trim() === label).length > 1;
      const code = kind === 'deduction'
        ? (type.deduction_code || type.code)
        : (type.defect_code || type.defect_type_code || type.code);
      const preserveEncodedCode = kind === 'defect' && Boolean(encodedGcDefectCode(type));
      const cell = sheet.getRow(headerRow).getCell(next);
      cell.value = `${prefix}: ${label}${(duplicate || preserveEncodedCode) && code ? ` (${code})` : ''}`;
      if (headerSource.style) cell.style = cloneExcelStyle(headerSource.style);
      sheet.getColumn(next).width = Math.max(10, Math.min(24, String(cell.value).length + 2));
      target.push({ type, column: next });
      next += 1;
    }
  }
}

// Template row between the header and the first data row whose first cell is a
// date (the pink "Sep-02" row). When present, the export writes one such row
// per work date and restarts STT at 1 under each date.
const { createWorkerReportDateGrouping } = require('./workerReportDateGrouping.cjs');
const { findDataStartRow, cloneRowStyle, findDateSeparatorRow, writeGroupedByDate } = createWorkerReportDateGrouping({
  findColumnMap, pickExact, applyReportRow, writeValue, number, asDate,
});

function normalizeGcDefectHeaders(sheet, headerRow) {
  const row = sheet.getRow(headerRow);
  const headerText = (column) => normalize(cellText(row.getCell(column)));
  let ngColumn = null;
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    if (headerText(column) === 'tong ng') { ngColumn = column; break; }
  }
  if (!ngColumn) throw new Error('GC template không tìm thấy cột Tổng NG.');
  const isNonDetailTail = (label) => /^(ty le|ghi chu|trang thai|id$|sp ?\/ ?gio|san pham ?\/ ?gio|nang suat)/.test(label);
  const defectColumns = [];
  for (let column = ngColumn + 1; column <= sheet.columnCount; column += 1) {
    if (isNonDetailTail(headerText(column))) break;
    defectColumns.push(column);
  }
  const expected = Object.values(GC_FORM_DEFECT_COLUMN_BY_CODE);
  const existing = new Set(defectColumns.map((column) => headerText(column)));
  if (expected.every((label) => existing.has(normalize(label)))) return false;
  if (defectColumns.length < 18) {
    throw new Error(`GC template cần tối thiểu 18 cột NG để thay thế, nhưng tìm thấy ${defectColumns.length}. Dừng để tránh sửa nhầm template.`);
  }
  // The current company template may contain more than 18 legacy NG columns.
  // Reuse the first 18 columns in place, then remove surplus columns from the
  // end of the NG block so no old defect columns remain beside the new catalogue.
  for (let index = 0; index < expected.length; index += 1) {
    row.getCell(defectColumns[index]).value = expected[index];
  }
  for (let index = defectColumns.length - 1; index >= expected.length; index -= 1) {
    sheet.spliceColumns(defectColumns[index], 1);
  }
  return true;
}

async function buildWorkerProcessWorkbook({ appPath, processCode, processName, date, processData = {}, includeSyncMetadata = false }) {
  const { templatePath, buffer: templateBuffer } = await getTemplateBuffer(appPath);
  const reports = Array.isArray(processData?.reports) ? [...processData.reports] : [];
  const code = String(processCode || '').trim().toUpperCase();
  const fileName = processWorkbookFileName(code,date);
  // Even an empty process must pass through rendering; raw templates may
  // contain sample data or formulas from a previous period.
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  const sheet = workbook.worksheets.find((item) => item.state !== 'hidden') || workbook.worksheets[0];
  if (!sheet) throw new Error('Template công nhân không có worksheet.');
  const headerRow = findHeader(sheet);
  if (code === 'GC') normalizeGcDefectHeaders(sheet, headerRow);
  const columnMap = findColumnMap(sheet, headerRow);
  const contract = buildColumnContract(columnMap, processData);
  // Reuse the existing audit column instead of shifting template merges/styles.
  if (Number(contract.cols.stt) === 1 && Number(contract.cols.entryDate) === 2) {
    sheet.getRow(headerRow).getCell(2).value = 'Thời gian nộp báo cáo';
    sheet.getColumn(2).hidden = true;
  }
  reports.sort((a, b) => String(a?.work_date || '').localeCompare(String(b?.work_date || '')) || number(a?.id) - number(b?.id));
  appendColumnsForUnmatchedTypes(sheet, headerRow, contract, reports, processData, code);

  addDerivedColumns(sheet, headerRow, contract);
  const workTimeColumn = insertContractColumn(sheet, headerRow, contract, contract.cols.shift, 'Thời gian làm việc', { width: 14, hidden: true });
contract.cols.workTime = workTimeColumn;
  const dataStartRow = findDataStartRow(sheet, headerRow);
  const dateRowNumber = findDateSeparatorRow(sheet, headerRow, dataStartRow);
  if(includeSyncMetadata){
    if(!contract.cols.id){
      contract.cols.id=Math.max(sheet.columnCount,contract.lastColumn||0)+1;
      sheet.getRow(headerRow).getCell(contract.cols.id).value='ID';
      sheet.getColumn(contract.cols.id).hidden=true;
      contract.lastColumn=contract.cols.id;
    }
    if(!contract.cols.date||contract.cols.date===contract.cols.entryDate||contract.cols.date===contract.cols.submittedAt){
      contract.cols.date=Math.max(sheet.columnCount,contract.lastColumn||0)+1;
      sheet.getRow(headerRow).getCell(contract.cols.date).value='Ngày sản xuất';
      sheet.getColumn(contract.cols.date).hidden=true;
      contract.lastColumn=contract.cols.date;
    }
  }
  let layout = 'flat';
  if (dateRowNumber) {
    layout = 'grouped-by-date';
    writeGroupedByDate(sheet, reports, contract, processData, dateRowNumber, dataStartRow, headerRow);
  } else {
    const sourceRow = sheet.getRow(dataStartRow);
    const requiredEndRow = dataStartRow + reports.length - 1;
    // The template ships with sample rows. Clear them before writing so a column
    // the contract does not map can never keep a sample value from the template.
    clearDataRows(sheet, dataStartRow, reports.length, sheet.columnCount);
    for (let r = dataStartRow; r <= requiredEndRow; r += 1) {
      const row = sheet.getRow(r);
      if (r !== dataStartRow) cloneRowStyle(sheet, sourceRow, row);
      applyReportRow(row, reports[r - dataStartRow], contract, processData, r - dataStartRow);
    }
    const clearCount = Math.max(0, sheet.rowCount - (dataStartRow + reports.length) + 1);
    clearDataRows(sheet, dataStartRow + reports.length, clearCount, sheet.columnCount);
  }
  workbook.calculation = { fullCalcOnLoad: true, forceFullCalc: true, calcMode: 'auto' };
  if(includeSyncMetadata){
    const {addWorkerReportSyncMetadata}=require('./workerReportSyncMetadata.cjs');
    addWorkerReportSyncMetadata(workbook,sheet,{code,date,processData,reports,contract,firstDataRow:dateRowNumber||dataStartRow,grouped:Boolean(dateRowNumber)});
  }
  const outputBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer: outputBuffer, fileName, processCode: code, processName: processName || processCode, reportCount: reports.length, templateKind: 'worker-template', templateFile: TEMPLATE_NAME, templatePath, templateSheet: sheet.name, headerRow, dataStartRow, layout,
    columnContract: {
      cols: contract.cols,
      detailColumns: contract.detailColumns,
      deductionColumns: contract.deductions.map((item) => ({ column: item.column, type: typeLabel(item.type, 'deduction') })),
      defectColumns: contract.defects.map((item) => ({ column: item.column, type: typeLabel(item.type, 'defect') })),
      unmatchedDeductionTypes: contract.unmatchedDeductionTypes,
      unmatchedDefectTypes: contract.unmatchedDefectTypes
    } };
}

module.exports = { TEMPLATE_NAME, PROCESS_CODES, PROCESS_FILE_PREFIXES, buildWorkerProcessWorkbook };
