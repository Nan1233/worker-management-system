'use strict';

const monthly = require('./monthlyWorkbookLocal.cjs');
// Capture the unpatched per-process builder for seven original company forms.
const buildOriginalProcessWorkbookLocal = monthly.buildCompanyOriginalProcessWorkbookLocal;
if (typeof buildOriginalProcessWorkbookLocal !== 'function') {
  throw new Error('Missing unwrapped original company Excel template builder.');
}
const { PROCESS_EXPORTS, MONTHLY_FILE_COUNT, normalizeYearMonth } = require('./monthlyExcelContract.cjs');
const { assertApprovedDatabasePayload } = require('./monthlyWorkbookReportData.cjs');
const ORIGINAL_COMPANY_CODES = new Set(Object.keys(PROCESS_EXPORTS).filter(code => PROCESS_EXPORTS[code].templateKind!=='worker-template'));

const { buildWorkerProcessWorkbook, PROCESS_CODES, PROCESS_FILE_PREFIXES } = require('./workerReportWorkbook.cjs');

function processRows(payload) {
  const processes = payload?.processes || {};
  return PROCESS_CODES.map((code) => {
    const data = processes[code] || {};
    return { processCode: code, processName: data.processName || data.process_name || code, data };
  });
}

const { mergeDefects, normalizeDeductions } = require('./reportDetailNormalizer.cjs');

function hydrateReportDetails(processData) {
  const types=Array.isArray(processData?.deductionTypes)?processData.deductionTypes:[];
  for(const report of Array.isArray(processData?.reports)?processData.reports:[]){
    const raw=report.rawDetail||{};
    const deductionRows=Array.isArray(raw.deductionRows)?raw.deductionRows:(report.deductions||[]);
    const defectRows=Array.isArray(raw.defectRows)?raw.defectRows:(report.defects||[]);
    // Never recover approved details from editable temporary reports.
    report.deductions=normalizeDeductions(deductionRows,report,report.machineLines||[],types);
    report.defects=mergeDefects(report,defectRows,report.machineLines||[]);
    report.excelDeductionsSource='approved_snapshot';
    report.excelDefectsSource='approved_snapshot';
  }
}

function gcSplitMetadata(report) {
  const value = report?.extra_data ?? report?.extraData ?? report?.rawDetail?.extra_data;
  if (value && typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value) || {}; } catch (_) { return {}; }
  }
  return {};
}

// Remove only verified split parents. Never divide historical machine totals.
function filterVerifiedGcSplitParents(reports) {
  const byId = new Map(reports.map((report) => [String(report?.id), report]));
  return reports.filter((report) => {
    const extra = gcSplitMetadata(report);
    if (extra.split_status !== 'SPLIT_PARENT') return true;
    const childIds = extra.split_into_report_ids;
    if (!Array.isArray(childIds) || !childIds.length) return true;
    const children = childIds.map((id) => byId.get(String(id)));
    if (children.some((child) => !child)) return true;
    if (children.some((child) => String(gcSplitMetadata(child).split_from_report_id) !== String(report.id))) return true;
    for (const key of ['tt_ok', 'tt_ng']) {
      const parentValue = Number(report[key]);
      const childValues = children.map((child) => Number(child[key]));
      if (!Number.isFinite(parentValue) || childValues.some((value) => !Number.isFinite(value))) return true;
      if (Math.abs(childValues.reduce((sum, value) => sum + value, 0) - parentValue) > 0.000001) return true;
    }
    return false;
  });
}

async function buildWorkerSplit({ appPath, date, payload, onTemplateLoaded }) {
  assertApprovedDatabasePayload(payload);
  const requestedMonth=normalizeYearMonth(date);
  if(payload.yearMonth && normalizeYearMonth(payload.yearMonth)!==requestedMonth)throw new Error('Sai kỳ dữ liệu Excel.');
  // Work on copies: preparing Excel rows must never mutate the API payload.
  payload={...payload,processes:Object.fromEntries(Object.entries(payload.processes||{}).map(([code,data])=>[code,{...data,reports:(data?.reports||[]).map(report=>({...report}))}]))};
  const sourceRows=processRows(payload);
  const processes = [];
  for (const item of sourceRows) {
    const processData = item.data || {};
    hydrateReportDetails(processData);
    if (item.processCode === 'GC' && Array.isArray(processData.reports)) {
      processData.reports = filterVerifiedGcSplitParents(processData.reports);
      // A multi-machine approved row has no trustworthy per-machine quantities.
      // Refuse to export a combined-machine Excel row instead of inventing OK/NG.
      for (const report of processData.reports) {
        const machineNames = String(report.machine_no || '')
          .split(/[,;\\n]+/).map((value) => value.trim()).filter(Boolean);
        const lineNames = Array.isArray(report.machineLines)
          ? [...new Set(report.machineLines.map((line) => String(line.machine_code || line.machine_no || line.machine_name || '').trim()).filter(Boolean))]
          : [];
        if (machineNames.length > 1 || lineNames.length > 1) {
          throw new Error(
            'Không thể xuất GC: báo cáo ' + report.id +
            ' vẫn gộp nhiều máy (' + (machineNames.length > 1 ? machineNames : lineNames).join(', ') +
            '). Cần tách và đối soát OK/NG theo từng máy trong TiDB trước khi xuất.'
          );
        }
      }
    }
    const reports = Array.isArray(processData.reports) ? processData.reports : [];
    for (const report of reports) {
      if (report?.dataSource !== 'production_reports' || report?.isApprovedDatabaseRecord !== true) {
        throw new Error(`Báo cáo ${report?.id || '?'} của ${item.processCode} không phải dữ liệu đã duyệt từ TiDB.`);
      }
      report.process_code = report.process_code || item.processCode;
    }
    // Six process files are populated from the corresponding Workbook1 sheet.
    // K1 and K2 retain their established templates; SX3 and CVK are unchanged.
    const built = ORIGINAL_COMPANY_CODES.has(item.processCode)
      ? await buildOriginalProcessWorkbookLocal({
          date, payload, processCode: item.processCode, onTemplateLoaded
        })
      : await buildWorkerProcessWorkbook({
          appPath,
          processCode: item.processCode,
          processName: processData.processName || processData.process_name || item.processCode,
          date,
          processData
        });
    const expectedTemplateKind = PROCESS_EXPORTS[item.processCode].templateKind;
    if (ORIGINAL_COMPANY_CODES.has(item.processCode) && built.templateKind !== expectedTemplateKind) {
      throw new Error('Không thể xuất ' + item.processCode + ': không dùng đúng mẫu ' + expectedTemplateKind + '.');
    }
    built.processCode = item.processCode;
    built.processName = processData.processName || processData.process_name || item.processCode;
    built.reportCount = reports.length;
    processes.push(built);
  }
  const summary = await monthly.buildMonthlySummaryWorkbookLocal({ date, payload });
  return { mode: 'PROCESS_WORKBOOKS', processes, summary, expectedFileCount: MONTHLY_FILE_COUNT };
}
module.exports = { buildWorkerSplit, PROCESS_CODES, PROCESS_FILE_PREFIXES };