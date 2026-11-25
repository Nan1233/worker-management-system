'use strict';
const { asText, asNumber, asInteger, asDate, asDateTime, dateKey } = require('./monthlyWorkbookValues.cjs');
const { APPROVED_DATA_SOURCE } = require('./monthlyExcelContract.cjs');
const { COLORS } = require('./monthlyWorkbookStyles.cjs');
const { PROCESS_TEMPLATE_SCHEMAS } = require('./monthlyWorkbookSchemas.cjs');
const { calculateProductionMetrics, DEFAULT_SETTINGS, calculateNg } = require('./productionCalculationEngine.cjs');
const { detailMap, reportDetailItems } = require('./monthlyWorkbookDetails.cjs');

function assertApprovedDatabasePayload(payload) {
  if (!payload || payload.dataSource !== APPROVED_DATA_SOURCE) {
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


module.exports = {
  assertApprovedDatabasePayload, machineDisplay, productDisplay, countedNg,
  reportTimeKey, formulaSettingsFor, excelOperationTypeLabel, excelOperationModeLabel,
  reportSnapshot, achievementColor, parseExtraData, rowValues,
  compareReportsForWorkbook, sortReports, settingsForReport, headerFontSize,
};
