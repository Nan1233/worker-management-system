'use strict';

const ExcelJS = require('exceljs');
const { buildSixProcessWorkbook } = require('./sixProcessWorkbookExportService');
const fs = require('node:fs/promises');
const path = require('node:path');
const db = require('../config/db');
const { resolveTemplatePath, getProcessTemplateContract, normalizeLabel } = require('./excelTemplateContractService');
const { mergeDefects, normalizeDeductions } = require('../utils/reportDetailNormalizer');
const { buildMachineExcelRows } = require('./machineLineExcelRows');

const alias = (value) => normalizeLabel(value);
const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows));
});

function findColumnMap(sheet, headerRow) {
  const map = new Map();
  for (let c = 1; c <= sheet.columnCount; c += 1) {
    const raw = sheet.getRow(headerRow).getCell(c).value;
    const label = alias(typeof raw === 'object' && raw?.result != null ? raw.result : raw);
    if (label) map.set(c, label);
  }
  return map;
}
function pickColumn(columnMap, predicates) {
  for (const [column, label] of columnMap.entries()) if (predicates.every((predicate) => predicate(label))) return column;
  return null;
}
function processColumns(sheet, contract, processCode) {
  const map = findColumnMap(sheet, contract.headerRow);
  const find = (...patterns) => pickColumn(map, patterns.map((p) => (label) => label.includes(alias(p))));
  const findExact = (...patterns) => pickColumn(map, patterns.map((p) => (label) => label === alias(p)));
  const cols = {
    workerCode: findExact('mã số cn') || findExact('mã nhân viên') || findExact('mã số'), workerName: findExact('họ tên') || findExact('họ & tên') || findExact('tên nhân viên') || findExact('tên công nhân'), shift: findExact('ca') || findExact('ca làm việc') || findExact('ca sản xuất'),
    machine: findExact('số máy') || findExact('máy đo') || findExact('máy mài') || findExact('máy'),
    product: findExact('mã sản phẩm') || findExact('mã số sản phẩm') || findExact('mã sp') || findExact('tên sp') || findExact('sản phẩm') || (processCode === 'GC' ? 6 : null),
    workDate: findExact('ngày sản xuất') || findExact('ngày/tháng') || findExact('ngày tháng') || findExact('ngày'), training: find('% học việc'), standard: findExact('định mức') || findExact('kh'), actual: find('thực tích') || find('kqsx') || find('kết quả sản xuất') || findExact('tt'), ok: findExact('sản phẩm ok') || findExact('sl ok') || findExact('ok'), ng: find('tổng ng') || find('tổng lỗi') || find('tổng pp'), achievement: find('% năng suất') || find('% thực tích') || find('% sản lượng theo kế hoạch') || findExact('%'), totalTime: null, actualTime: null
  };
  const timeCandidates = [];
  for (const [column, label] of map.entries()) if (label.includes('thời gian') || label === 'thời gian') timeCandidates.push(column);
  const timeRules = { CAN: [6], EP: [7], XLBV: [11], GC: [7, 8], MAI: [9, 10], DO: [8, 9], K1: [14], K2: [22, 23], SX3: [8, 9] };
  const preferred = timeRules[processCode] || [];
  const validPreferred = preferred.filter((column) => {
    const label = map.get(column) || '';
    return label.includes('thoi gian') || label.includes('thời gian');
  });
  cols.totalTime = validPreferred[0] || timeCandidates[0] || null;
  cols.actualTime = validPreferred[1] || timeCandidates[1] || cols.totalTime;
  // Never silently map a required time field outside the physical header.
  for (const field of ['totalTime', 'actualTime']) {
    if (cols[field] && cols[field] > sheet.columnCount) cols[field] = null;
  }
  return { map, cols };
}
function rawValue(report, key) {
  const value = report?.[key]; if (value !== undefined && value !== null) return value;
  const extra = report?.extra_data; if (!extra) return null;
  try { const parsed = typeof extra === 'string' ? JSON.parse(extra) : extra; return parsed?.[key] ?? null; } catch (_) { return null; }
}
function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(String(value));
  if (match) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function metric(report, key) {
  if (key === 'actual_output') return Number(report?.actual_output ?? 0); if (key === 'standard_output') return Number(report?.standard_output ?? 0); if (key === 'tt_ok') return Number(report?.tt_ok ?? 0); if (key === 'tt_ng') return Number(report?.tt_ng ?? 0);
  if (key === 'achievement_rate') { const standard = Number(report?.standard_output ?? 0), actual = Number(report?.actual_output ?? 0), time = Number(report?.actual_time ?? report?.total_time ?? 0); return standard > 0 && time > 0 ? actual / (standard * time) : 0; }
  return Number(report?.[key] ?? 0);
}
function writeDefectsAndDeductions(row, report, columnMap, reservedColumns = new Set()) {
  const defects = Array.isArray(report?.defects) ? report.defects : [], deductions = Array.isArray(report?.deductions) ? report.deductions : [];
  for (const [column, label] of columnMap.entries()) {
    if (reservedColumns.has(column)) continue;
    const normalized = alias(label);
    const defect = defects.find((item) => {
      const name = alias(item?.defect_name || item?.name || item?.defect_code);
      return name && normalized && (name === normalized || name.includes(normalized) || normalized.includes(name));
    });
    if (defect) { row.getCell(column).value = Number(defect.quantity ?? defect.count ?? defect.value ?? 0); continue; }
    const deduction = deductions.find((item) => {
      const name = alias(item?.deduction_name || item?.name || item?.deduction_code);
      return name && normalized && (name === normalized || name.includes(normalized) || normalized.includes(name));
    });
    if (deduction) row.getCell(column).value = Number(deduction.hours ?? deduction.time ?? deduction.value ?? 0);
  }
}
function writeReportRow(sheet, rowNumber, report, processCode, mapping) {
  const row = sheet.getRow(rowNumber), c = mapping.cols;
  const set = (column, value) => {
    if (!column) return;
    // Never allow user-entered worker/product/machine text to be interpreted
    // as an Excel formula. Preserve the exact text as an explicit string cell.
    const cell = row.getCell(column);
    if (typeof value === 'string') {
      cell.value = value;
      cell.numFmt = '@';
    } else {
      cell.value = value == null ? null : value;
    }
  };
  set(c.workerCode, report.worker_code); set(c.workerName, report.full_name || report.worker_name); set(c.shift, report.shift); set(c.machine, report.machine_no); set(c.product, report.product_name || rawValue(report, 'product_code')); set(c.workDate, asDate(report.work_date)); set(c.training, report.training_percent); set(c.standard, metric(report, 'standard_output')); set(c.actual, metric(report, 'actual_output')); set(c.ok, metric(report, 'tt_ok')); set(c.ng, metric(report, 'tt_ng')); set(c.achievement, metric(report, 'achievement_rate')); set(c.totalTime, metric(report, 'total_time')); if (c.actualTime && c.actualTime !== c.totalTime) set(c.actualTime, metric(report, 'actual_time')); writeDefectsAndDeductions(row, report, mapping.map, new Set(Object.values(c).filter(Boolean)));
}
function clearBrokenAndExternalFormulas(workbook) {
  let removed = 0;
  workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => {
    const value = cell.value;
    const formula = typeof value === 'string' && value.startsWith('=')
      ? value : value && typeof value === 'object' ? value.formula || value.sharedFormula : null;
    if (formula && (formula.includes('#REF!') || /\\[[^\\]]+\\]/.test(formula))) {
      cell.value = null;
      removed += 1;
    }
  })));
  return removed;
}
function clearDetailConstants(sheet, startRow, endRow) {
  for (let r = startRow; r <= endRow; r += 1) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const cell = row.getCell(c);
      // Keep the cell style but clear all stale sample values and formulas.
      // A preserved template formula could otherwise reference a previous report.
      cell.value = null;
    }
  }
}

async function hydrateExportDetailFallbacks(reports) {
  if (!Array.isArray(reports) || !reports.length) return reports;
  const reportIds = reports.map((report) => Number(report.id)).filter(Number.isFinite);
  if (!reportIds.length) return reports;
  const placeholders = reportIds.map(() => '?').join(',');

  const [legacyRows, tempDeductionRows, tempDefectRows, machineDefectRows] = await Promise.all([
    query(`SELECT id, kqd_dap_lai, kqd_tuot, vo_do_long, xuoc_do_long, cong_gay, xoay, khong_dut, bavia_hut, ppcm, loi_cao_su, ng_kich_thuoc, cat_lem FROM production_reports WHERE id IN (${placeholders})`, reportIds),
    query(`SELECT pr.id AS report_id, td.deduction_type_id, dt.deduction_code, dt.deduction_name, td.hours FROM production_reports pr INNER JOIN production_temp_deductions td ON td.temp_report_id=pr.source_temp_id LEFT JOIN deduction_types dt ON dt.id=td.deduction_type_id WHERE pr.id IN (${placeholders}) AND pr.source_temp_id IS NOT NULL`, reportIds),
    query(`SELECT pr.id AS report_id, td.defect_type_id, dt.defect_code, dt.defect_name, td.quantity FROM production_reports pr INNER JOIN production_temp_defects td ON td.temp_report_id=pr.source_temp_id LEFT JOIN defect_types dt ON dt.id=td.defect_type_id WHERE pr.id IN (${placeholders}) AND pr.source_temp_id IS NOT NULL`, reportIds),
    query(`SELECT ml.report_id, md.machine_line_id, md.defect_type_id, md.defect_code, md.defect_name, md.quantity FROM production_report_machine_lines ml INNER JOIN production_report_machine_defects md ON md.machine_line_id=ml.id WHERE ml.report_id IN (${placeholders}) ORDER BY ml.report_id, md.id`, reportIds)
  ]);

  const legacyById = new Map(legacyRows.map((row) => [Number(row.id), row]));
  const tempDeductionsById = new Map();
  const tempDefectsById = new Map();
  const machineDefectsByReportId = new Map();
  const machineDefectsByLineId = new Map();
  for (const row of tempDeductionRows) { const id = Number(row.report_id); if (!tempDeductionsById.has(id)) tempDeductionsById.set(id, []); tempDeductionsById.get(id).push(row); }
  for (const row of tempDefectRows) { const id = Number(row.report_id); if (!tempDefectsById.has(id)) tempDefectsById.set(id, []); tempDefectsById.get(id).push(row); }
  for (const row of machineDefectRows) {
    const id = Number(row.report_id);
    if (!machineDefectsByReportId.has(id)) machineDefectsByReportId.set(id, []);
    machineDefectsByReportId.get(id).push(row);
    const lineId = Number(row.machine_line_id);
    if (lineId > 0) {
      if (!machineDefectsByLineId.has(lineId)) machineDefectsByLineId.set(lineId, []);
      machineDefectsByLineId.get(lineId).push(row);
    }
  }

  for (const report of reports) {
    const id = Number(report.id);
    const legacy = legacyById.get(id);
    if (legacy) Object.assign(report, legacy);
    const existingDeductions = Array.isArray(report.deductions) ? report.deductions : [];
    const tempDeductions = tempDeductionsById.get(id) || [];
    const deductionRows = existingDeductions.length ? existingDeductions : tempDeductions;
    report.deductions = normalizeDeductions(deductionRows, report, Array.isArray(report.machineLines) ? report.machineLines : [], reports.deductionTypes || []);

    const existingDefects = Array.isArray(report.defects) ? report.defects : [];
    const tempDefects = tempDefectsById.get(id) || [];
    const machineDefects = machineDefectsByReportId.get(id) || [];
    for (const line of (Array.isArray(report.machineLines) ? report.machineLines : [])) {
      const lineDefects = machineDefectsByLineId.get(Number(line.id));
      if (lineDefects?.length) line.defects = lineDefects;
    }
    const defectRows = existingDefects.length ? existingDefects : [...tempDefects, ...machineDefects];
    report.defects = mergeDefects(report, defectRows, Array.isArray(report.machineLines) ? report.machineLines : []);
  }
  return reports;
}

// Compatibility export retained for callers that still import this helper.
// Historical production reports must never be rewritten from today's mutable
// master data, including through a legacy call site.
async function applyCurrentDbMasterData(reports) {
  return reports;
}

async function buildTemplateDrivenProcessWorkbook(reports, yearMonth, options = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(yearMonth))) {
    throw Object.assign(new Error('Tháng xuất Excel không hợp lệ (YYYY-MM)'), {
      code: 'KTC_EXCEL_INVALID_MONTH', statusCode: 422
    });
  }
  if (!Array.isArray(reports)) {
    throw Object.assign(new TypeError('Production reports must be an array'), {
      code: 'KTC_EXCEL_INVALID_REPORTS', statusCode: 422
    });
  }
  const processCode = String(options.processCode || reports?.[0]?.process_code || '').trim().toUpperCase();
  if (reports.some((report) => !report || typeof report !== 'object' || Array.isArray(report))) {
    throw Object.assign(new TypeError('Each production report must be an object'), {
      code: 'KTC_EXCEL_INVALID_REPORTS', statusCode: 422
    });
  }
  if (reports.some((report) => report?.process_code && String(report.process_code).trim().toUpperCase() !== processCode)) {
    throw Object.assign(new Error('Không thể xuất nhiều công đoạn vào cùng một file'), {
      code: 'KTC_EXCEL_MIXED_PROCESSES', statusCode: 422
    });
  }
  // Hydration enriches detail arrays. Work on detached records so callers do
  // not observe export-only mutations after the workbook has been generated.
  const exportReports = reports.map((report) => ({
    ...report,
    machineLines: Array.isArray(report.machineLines)
      ? report.machineLines.map((line) => ({ ...line })) : report.machineLines,
    defects: Array.isArray(report.defects) ? [...report.defects] : report.defects,
    deductions: Array.isArray(report.deductions) ? [...report.deductions] : report.deductions
  }));
  // The export loader also accepts metadata attached to the report array.
  // Preserve that context while isolating individual mutable report records.
  exportReports.deductionTypes = reports.deductionTypes;
  if (['GC','MAI','DO','XLBV','EP','CAN'].includes(processCode)) {
    await hydrateExportDetailFallbacks(exportReports);
    // Preserve the historical report snapshot; do not override standards with today's DB master data.
    const exportRows = buildMachineExcelRows(exportReports);
    return buildSixProcessWorkbook(exportRows, yearMonth, { ...options, processCode });
  }
  const contract = getProcessTemplateContract(processCode); const templatePath = await resolveTemplatePath(); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(templatePath);
  const sheet = workbook.getWorksheet(contract.sheet); if (!sheet) throw Object.assign(new Error(`File mẫu thiếu sheet ${contract.sheet}`), { code: 'KTC_EXCEL_TEMPLATE_SHEET_MISSING', statusCode: 500 });
  await hydrateExportDetailFallbacks(exportReports);
  // Historical standards, product codes and machine identifiers are immutable
  // report snapshots. Never replace them with today's master-data values.
  const exportRows = buildMachineExcelRows(exportReports);
  const capacity = contract.dataEndRow - contract.dataStartRow + 1;
  if (!Number.isInteger(contract.dataStartRow) || !Number.isInteger(contract.dataEndRow)
      || contract.dataStartRow <= contract.headerRow || contract.dataEndRow < contract.dataStartRow
      || contract.dataEndRow > sheet.rowCount) {
    throw Object.assign(new Error('Vùng dữ liệu trong template ' + contract.sheet + ' không hợp lệ'), {
      code: 'KTC_EXCEL_TEMPLATE_RANGE_INVALID', statusCode: 422
    });
  }
  if (exportRows.length > capacity) throw Object.assign(new Error(`File mẫu ${contract.sheet} chỉ có ${capacity} dòng chi tiết; tháng ${yearMonth} cần ${exportRows.length} dòng máy-người từ ${reports.length} báo cáo`), { code: 'KTC_EXCEL_TEMPLATE_CAPACITY_EXCEEDED', statusCode: 422 });
  const mapping = processColumns(sheet, contract, processCode);
  // Fail closed when a template has changed: silently skipping these columns
  // produces an apparently valid workbook with missing production data.
  const requiredColumns = ['workerCode', 'workDate', 'shift', 'product', 'actual'];
  const missingColumns = requiredColumns.filter((name) => !mapping.cols[name]);
  // A template can contain a valid-looking header at a different physical
  // position. Never write the essential identity/output fields into a blank
  // or unrelated header cell based on a hard-coded fallback alone.
  const headerLabel = (field) => mapping.map.get(mapping.cols[field]) || '';
  if (processCode === 'GC' && mapping.cols.product === 6
      && !/(?:^| )(?:ma|ten|san pham|sp)(?: |$)/.test(headerLabel('product'))) {
    missingColumns.push('product (header mismatch)');
  }
  // A fuzzy header lookup may accidentally resolve two distinct fields to
  // the same worksheet column. Reject such templates instead of overwriting
  // one production value with another.
  const columnOwners = new Map();
  const collisions = [];
  for (const [field, column] of Object.entries(mapping.cols)) {
    if (!column || (field === 'actualTime' && column === mapping.cols.totalTime)) continue;
    if (columnOwners.has(column)) collisions.push(columnOwners.get(column) + '/' + field + ' (cột ' + column + ')');
    else columnOwners.set(column, field);
  }
  if (collisions.length) {
    throw Object.assign(new Error('File mẫu ' + contract.sheet + ' có cột bị ánh xạ trùng: ' + collisions.join(', ')), {
      code: 'KTC_EXCEL_TEMPLATE_COLUMN_COLLISION', statusCode: 422
    });
  }
  if (missingColumns.length) {
    throw Object.assign(new Error(`File mẫu ${contract.sheet} thiếu cột bắt buộc: ${missingColumns.join(', ')}`), {
      code: 'KTC_EXCEL_TEMPLATE_COLUMN_MISSING', statusCode: 422
    });
  }
  clearDetailConstants(sheet, contract.dataStartRow, contract.dataEndRow);
  for (let index = 0; index < exportRows.length; index += 1) writeReportRow(sheet, contract.dataStartRow + index, exportRows[index], processCode, mapping);
  const removedBrokenFormulas = clearBrokenAndExternalFormulas(workbook); workbook.calculation = { fullCalcOnLoad: true, forceFullCalc: true, calcMode: 'auto' };
  const exportRoot = options.exportRoot || path.join(process.cwd(), 'exports-process'); const [year, month] = String(yearMonth).split('-'); const folder = path.join(exportRoot, year, path.basename(String(options.processName || processCode).split(String.fromCharCode(92)).join('/')).replace(/[<>:"|?*\x00-\x1f]/g, '_'), month); await fs.mkdir(folder, { recursive: true });
  const fileName = options.fileName || `Bao-cao-${processCode}-${month}-${year}.xlsx`;
  if (typeof fileName !== 'string' || fileName !== path.basename(fileName)
      || fileName.includes('/') || fileName.includes(String.fromCharCode(92))
      || /[<>:"|?*\x00-\x1f]/.test(fileName) || !fileName.toLowerCase().endsWith('.xlsx')) {
    throw Object.assign(new Error('Tên file xuất Excel không hợp lệ'), {
      code: 'KTC_EXCEL_INVALID_FILENAME', statusCode: 422
    });
  }
  const outputPath = path.join(folder, fileName);
  const temporaryPath = path.join(folder, `.${fileName}.${process.pid}.${require('node:crypto').randomUUID()}.tmp`);
  try {
    await workbook.xlsx.writeFile(temporaryPath);
    // Keep the existing export recoverable while publishing a newer workbook.
    // A backup is unique per overwrite and never replaces an earlier backup.
    const previous = await fs.stat(outputPath).catch((error) => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (previous) {
      const recoveryPath = `${outputPath}.${require('node:crypto').randomUUID()}.recovery.xlsx`;
      await fs.copyFile(outputPath, recoveryPath, require('node:fs').constants.COPYFILE_EXCL);
      const current = await fs.stat(outputPath);
      if (current.mtimeMs !== previous.mtimeMs || current.size !== previous.size) {
        throw Object.assign(new Error('Existing export changed during recovery snapshot'), {
          code: 'KTC_EXCEL_CONCURRENT_MODIFICATION'
        });
      }
    }
    await fs.rename(temporaryPath, outputPath);
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
  }
  return { archivePath: outputPath, fileName, processCode, templateFile: path.basename(templatePath), templateSheet: contract.sheet, templateHeaderRow: contract.headerRow, dataStartRow: contract.dataStartRow, reportCount: reports.length, rowCount: exportRows.length, removedBrokenFormulas };
}

module.exports = { buildTemplateDrivenProcessWorkbook, applyCurrentDbMasterData };