'use strict';

const path = require('node:path');
const ExcelJS = require('exceljs');
const monthly = require('./monthlyWorkbookLocal.cjs');
// Capture the unpatched per-process builder for seven original company forms.
const buildOriginalProcessWorkbookLocal = monthly.buildCompanyOriginalProcessWorkbookLocal;
if (typeof buildOriginalProcessWorkbookLocal !== 'function') {
  throw new Error('Missing unwrapped original company Excel template builder.');
}
const ORIGINAL_COMPANY_CODES = new Set(['GC', 'MAI', 'DO', 'K1', 'K2', 'CAN', 'EP', 'XLBV']);
const WORKBOOK1_CODES = new Set(['GC', 'MAI', 'DO', 'CAN', 'EP', 'XLBV']);

const { buildWorkerProcessWorkbook, PROCESS_CODES, PROCESS_FILE_PREFIXES } = require('./workerReportTemplateLocal.v2.cjs');

const norm = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd').replace(/\s+/g, ' ').trim().toLowerCase();

function cellText(cell) {
  const value = cell?.value;
  if (value && typeof value === 'object') {
    if (value.result != null) return String(value.result);
    if (Array.isArray(value.richText)) return value.richText.map((x) => String(x?.text ?? '')).join('');
  }
  return String(value ?? '');
}

function combinedHeaderMap(sheet, headerRow) {
  const map = new Map();
  const start = Math.max(1, Number(headerRow || 1) - 3);
  for (let c = 1; c <= sheet.columnCount; c += 1) {
    const parts = [];
    for (let r = start; r <= headerRow; r += 1) {
      const text = norm(cellText(sheet.getRow(r).getCell(c)));
      if (text && !parts.includes(text)) parts.push(text);
    }
    if (parts.length) map.set(c, parts.join(' | '));
  }
  return map;
}

const { isNonProductWorkReport, normalizedWorkTypeLabel } = require('./nonProductWorkReport.cjs');

function findHeaderColumn(map, predicates) {
  for (const [column, label] of map.entries()) {
    if (predicates.every((predicate) => predicate(label))) return column;
  }
  return null;
}

function containsAny(label, terms) {
  return terms.some((term) => label.includes(norm(term)));
}

function repairWorkerRows(buffer, built, processData) {
  if (!Array.isArray(processData?.reports) || !processData.reports.length) return buffer;
  return (async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets.find((item) => item.state !== 'hidden') || workbook.worksheets[0];
    if (!sheet) return buffer;

    const headerRow = Number(built?.headerRow || 0);
    const dataStartRow = Number(built?.dataStartRow || 0);
    if (!headerRow || !dataStartRow) return buffer;

    const map = combinedHeaderMap(sheet, headerRow);
    const cols = {
      workerCode: findHeaderColumn(map, [(label) => containsAny(label, ['ma nv', 'ma nhan vien', 'ma cong nhan', 'ma cn', 'worker code'])]),
      workerName: findHeaderColumn(map, [(label) => containsAny(label, ['ho ten', 'ten nv', 'ten cong nhan', 'full name'])]),
      shift: findHeaderColumn(map, [(label) => /(^|\| )ca( |\||$)/.test(label)]),
      machine: findHeaderColumn(map, [(label) => containsAny(label, ['so may', 'ma may', 'machine']) || /(^|\| )may( |\||$)/.test(label)]),
      product: findHeaderColumn(map, [(label) => containsAny(label, ['ma sp', 'ma san pham', 'san pham', 'product'])]),
      operationType: findHeaderColumn(map, [(label) => containsAny(label, ['loai thao tac', 'operation type'])]),
      operationMode: findHeaderColumn(map, [(label) => containsAny(label, ['che do', 'operation mode'])]),
      training: findHeaderColumn(map, [(label) => containsAny(label, ['hoc viec', 'training'])]),
      standard: findHeaderColumn(map, [(label) => containsAny(label, ['dinh muc', 'standard'])]),
      totalTime: findHeaderColumn(map, [(label) => containsAny(label, ['tong thoi gian', 'thoi gian lam viec', 'thoi gian'])]),
      actualTime: findHeaderColumn(map, [(label) => containsAny(label, ['thoi gian thuc te', 'actual time'])]),
      deductionTotal: findHeaderColumn(map, [(label) => containsAny(label, ['tong thoi gian tru', 'tong tru', 'tru h'])]),
      ok: findHeaderColumn(map, [(label) => containsAny(label, ['sl ok', 'san pham ok']) || /(^|\| )ok( |\||$)/.test(label)]),
      ng: findHeaderColumn(map, [(label) => containsAny(label, ['tong ng', 'tong loi']) || /(^|\| )ng( |\||$)/.test(label)]),
      output: findHeaderColumn(map, [(label) => containsAny(label, ['ket qua san xuat', 'thuc tich', 'san luong']) || /(^|\| )tt( |\||$)/.test(label)]),
      achievement: findHeaderColumn(map, [(label) => containsAny(label, ['ty le dat', 'ty le thuc tich', 'nang suat', 'achievement'])]),
      outputPerHour: findHeaderColumn(map, [(label) => containsAny(label, ['sp gio', 'san pham gio'])]),
      ngRate: findHeaderColumn(map, [(label) => containsAny(label, ['ty le ng'])]),
      status: findHeaderColumn(map, [(label) => containsAny(label, ['trang thai', 'status'])]),
      note: findHeaderColumn(map, [(label) => containsAny(label, ['ghi chu', 'note'])])
    };

    // workerReportTemplateLocal.v2 already wrote every field it could map, and
    // owns the Trừ H / NG detail blocks. This repair pass only fills base fields
    // v2 could not map, and never writes into a detail column or a column v2
    // already used for a different field.
    const v2Contract = built?.columnContract || null;
    const v2Cols = v2Contract?.cols || {};
    const protectedColumns = new Set((v2Contract?.detailColumns || []).map(Number));
    for (const value of Object.values(v2Cols)) if (value) protectedColumns.add(Number(value));
    for (const field of Object.keys(cols)) {
      if (!v2Contract) continue;
      if (v2Cols[field] || protectedColumns.has(Number(cols[field]))) cols[field] = null;
    }

    const setIfMapped = (row, column, value) => {
      if (column && value !== undefined && value !== null && value !== '') row.getCell(column).value = value;
    };

    const reportList = [...processData.reports];
    reportList.sort((a, b) => String(a?.work_date || '').localeCompare(String(b?.work_date || '')) || Number(a?.id || 0) - Number(b?.id || 0));

    for (let i = 0; i < reportList.length; i += 1) {
      const report = reportList[i];
      const row = sheet.getRow(dataStartRow + i);
      setIfMapped(row, cols.workerCode, report.worker_code);
      setIfMapped(row, cols.workerName, report.full_name || report.worker_name || report.name);
      setIfMapped(row, cols.shift, report.shift);
      setIfMapped(row, cols.machine, report.machine_no ?? report.machine_code ?? report.machine);
      // Non-product CVK/legacy GC reports have no product. Preserve the canonical
      // work-type label in the existing code field; never replace it with an empty
      // product_name/product_code during the repair pass.
      const workTypeLabel = normalizedWorkTypeLabel(report);
      const productValue = isNonProductWorkReport(report)
        ? workTypeLabel
        : (report.product_name || report.product_code);
      setIfMapped(row, cols.product, productValue);
      setIfMapped(row, cols.operationType, report.operation_type);
      setIfMapped(row, cols.operationMode, report.operation_mode);
      setIfMapped(row, cols.training, Number(report.training_percent ?? 0));
      setIfMapped(row, cols.standard, Number(report.standard_output ?? 0));
      setIfMapped(row, cols.totalTime, Number(report.total_time ?? report.actual_time ?? 0));
      setIfMapped(row, cols.actualTime, Number(report.actual_time ?? report.total_time ?? 0));
      setIfMapped(row, cols.deductionTotal, Number(report.deduction_time ?? 0));
      setIfMapped(row, cols.ok, Number(report.tt_ok ?? report.actual_output ?? 0));
      setIfMapped(row, cols.ng, Number(report.tt_ng ?? 0));
      setIfMapped(row, cols.output, Number(report.actual_output ?? report.tt_ok ?? 0));
      setIfMapped(row, cols.achievement, Number(report.calculationSnapshot?.achievement_rate ?? report.achievement_rate ?? 0));
      setIfMapped(row, cols.outputPerHour, Number(report.calculationSnapshot?.actual_per_hour ?? report.actual_output_per_hour ?? 0));
      setIfMapped(row, cols.ngRate, Number(report.calculationSnapshot?.ng_rate ?? report.ng_rate ?? 0));
      setIfMapped(row, cols.status, report.status);
      setIfMapped(row, cols.note, report.note || report.review_note);

      // Trừ H / NG detail columns are written by workerReportTemplateLocal.v2
      // using a range-restricted one-to-one mapping. Do not rewrite them here.
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  })();
}

function processRows(payload) {
  const processes = payload?.processes || {};
  return PROCESS_CODES.map((code) => {
    const data = processes[code] || {};
    return { processCode: code, processName: data.processName || data.process_name || code, data };
  });
}

const { mergeDefects, normalizeDeductions } = require('./reportDetailNormalizer.cjs');

function sumPositive(rows, field) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
    const value = Number(row?.[field]);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
}
function sameNumber(a, b, tolerance = 0.01) {
  return Math.abs(Number(a || 0) - Number(b || 0)) <= tolerance;
}

// Same selection + normalisation the backend used to run (moved off the Worker).
// Some export endpoints return already-hydrated details without rawDetail. Never
// skip those reports: use their detail arrays, then reconcile against legacy and
// machine-line sources so NG is not silently lost from the Excel export.
function hydrateReportDetails(processData) {
  const types = Array.isArray(processData?.deductionTypes) ? processData.deductionTypes : [];
  for (const report of Array.isArray(processData?.reports) ? processData.reports : []) {
    const raw = report?.rawDetail || {};
    const hasRawDetail = Boolean(report?.rawDetail);
    const deductionRows = Array.isArray(raw.deductionRows) && raw.deductionRows.length
      ? raw.deductionRows
      : (Array.isArray(report?.deductions) ? report.deductions : (Array.isArray(raw.deductionRows) ? raw.deductionRows : []));
    const tempDeductionRows = Array.isArray(raw.tempDeductionRows) ? raw.tempDeductionRows : [];
    const expectedDeductionHours = Number(report.deduction_time) || 0;
    const selectedDeductionRows = hasRawDetail && expectedDeductionHours > 0
      && !sameNumber(sumPositive(deductionRows, 'hours'), expectedDeductionHours)
      && sameNumber(sumPositive(tempDeductionRows, 'hours'), expectedDeductionHours)
      ? tempDeductionRows
      : deductionRows;
    report.deductions = normalizeDeductions(selectedDeductionRows, report, report.machineLines || [], types);

    const defectRows = Array.isArray(raw.defectRows) && raw.defectRows.length
      ? raw.defectRows
      : (Array.isArray(report?.defects) ? report.defects : (Array.isArray(raw.defectRows) ? raw.defectRows : []));
    const tempDefectRows = Array.isArray(raw.tempDefectRows) ? raw.tempDefectRows : [];
    const expectedDefects = Math.trunc(Number(report.tt_ng) || 0);
    const selectedDefectRows = hasRawDetail && expectedDefects > 0
      && Math.trunc(sumPositive(defectRows, 'quantity')) !== expectedDefects
      && Math.trunc(sumPositive(tempDefectRows, 'quantity')) === expectedDefects
      ? tempDefectRows
      : defectRows;
    report.defects = mergeDefects(report, selectedDefectRows, report.machineLines || []);
    report.excelDeductionsSource = hasRawDetail && selectedDeductionRows === tempDeductionRows
      ? 'production_temp_deductions_fallback'
      : (hasRawDetail ? 'production_report_deductions' : 'api_payload_or_normalized');
    report.excelDefectsSource = hasRawDetail && selectedDefectRows === tempDefectRows && selectedDefectRows.length
      ? 'production_temp_defects_fallback'
      : (selectedDefectRows.length
        ? (hasRawDetail ? 'production_report_defects' : 'api_payload_or_normalized')
        : (report.defects.length ? 'legacy_columns_normalized' : 'none'));
  }
}

// Legacy aggregation helper retained for compatibility with older callers.
// The active monthly export below deliberately does not use it: each process
// is built from its own payload and written to its own workbook.
function mergeProcessData(rows) {
  const merged = { processName: 'Báo cáo công nhân', reports: [], deductionTypes: [], defectTypes: [] };
  const seenDeduction = new Set();
  const seenDefect = new Set();
  for (const item of rows) {
    const data = item.data || {};
    hydrateReportDetails(data);
    for (const report of Array.isArray(data.reports) ? data.reports : []) {
      merged.reports.push({ ...report, process_code: report.process_code || item.processCode });
    }
    for (const type of Array.isArray(data.deductionTypes) ? data.deductionTypes : []) {
      const key = type?.id != null ? `ID:${type.id}` : `CODE:${type?.deduction_code || type?.code || type?.deduction_name || type?.name || ''}`;
      if (seenDeduction.has(key)) continue;
      seenDeduction.add(key);
      merged.deductionTypes.push(type);
    }
    for (const type of Array.isArray(data.defectTypes) ? data.defectTypes : []) {
      const key = type?.id != null ? `ID:${type.id}` : `CODE:${type?.defect_code || type?.code || type?.defect_name || type?.name || ''}`;
      if (seenDefect.has(key)) continue;
      seenDefect.add(key);
      merged.defectTypes.push(type);
    }
  }

  // Some export payloads include detail rows but omit the process-level type
  // catalogue. Derive only the missing type definitions from the persisted
  // detail rows so writeDetailBlock can resolve them by ID/code/name.
  for (const report of merged.reports) {
    for (const detail of Array.isArray(report.deductions) ? report.deductions : []) {
      const id = detail?.deduction_type_id ?? detail?.id;
      const code = detail?.deduction_type_code || detail?.deduction_code || detail?.code || '';
      const name = detail?.deduction_type_name || detail?.deduction_name || detail?.name || '';
      if (id == null && !code && !name) continue;
      const key = id != null ? `ID:${id}` : `CODE:${code || name}`;
      if (seenDeduction.has(key)) continue;
      seenDeduction.add(key);
      merged.deductionTypes.push({ id: id ?? undefined, deduction_code: code, code, deduction_name: name, name });
    }
    for (const detail of Array.isArray(report.defects) ? report.defects : []) {
      const id = detail?.defect_type_id ?? detail?.id;
      const code = detail?.defect_type_code || detail?.defect_code || detail?.code || '';
      const name = detail?.defect_type_name || detail?.defect_name || detail?.name || detail?.label || '';
      if (id == null && !code && !name) continue;
      const key = id != null ? `ID:${id}` : `CODE:${code || name}`;
      if (seenDefect.has(key)) continue;
      seenDefect.add(key);
      merged.defectTypes.push({ id: id ?? undefined, defect_code: code, code, defect_name: name, name });
    }
  }
  return merged;
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
  if (!payload || payload.dataSource !== 'tidb.production_reports.approved') {
    throw new Error('Excel chỉ được xuất từ production_reports đã duyệt trong TiDB.');
  }
  const sourceRows = processRows(payload);
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
    const expectedTemplateKind = WORKBOOK1_CODES.has(item.processCode) ? 'workbook1-sheet' : 'original-company';
    if (ORIGINAL_COMPANY_CODES.has(item.processCode) && built.templateKind !== expectedTemplateKind) {
      throw new Error('Không thể xuất ' + item.processCode + ': không dùng đúng mẫu ' + expectedTemplateKind + '.');
    }
    built.processCode = item.processCode;
    built.processName = processData.processName || processData.process_name || item.processCode;
    built.reportCount = reports.length;
    processes.push(built);
  }
  const summary = await monthly.buildMonthlySummaryWorkbookLocal({ date, payload });
  return { mode: 'PROCESS_WORKBOOKS', processes, summary, expectedFileCount: processes.length + 1 };
}
module.exports = { buildWorkerSplit, PROCESS_CODES, PROCESS_FILE_PREFIXES };