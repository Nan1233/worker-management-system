'use strict';

const ExcelJS = require('exceljs');
const fs = require('node:fs/promises');
const path = require('node:path');
const db = require('../config/db');
const { resolveTemplatePath, getProcessTemplateContract, normalizeLabel } = require('./excelTemplateContractService');
const { mergeDefects, normalizeDeductions } = require('../utils/reportDetailNormalizer');

const alias = (value) => normalizeLabel(value);
const query = (sql, params = []) => new Promise((resolve, reject) => {
  db.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows);
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
    workerCode: find('mã số cn') || find('mã nhân viên') || find('mã số'), workerName: find('họ tên') || find('họ & tên') || find('tên') || find('người'), shift: find('ca'),
    machine: find('số máy') || find('máy đo') || find('máy mài') || find('máy'),
    product: findExact('mã sản phẩm') || findExact('mã số sản phẩm') || findExact('mã sp') || findExact('tên sp') || findExact('sản phẩm') || (processCode === 'GC' ? 6 : null),
    workDate: find('ngày sản xuất') || find('ngày/tháng') || find('ngày tháng') || find('ngày'), training: find('% học việc'), standard: find('định mức') || find('kh'), actual: find('thực tích') || find('kqsx') || find('kết quả sản xuất') || find('tt'), ok: find('sản phẩm ok') || find('sl ok') || find('ok'), ng: find('tổng ng') || find('tổng lỗi') || find('tổng pp'), achievement: find('% năng suất') || find('% thực tích') || find('% sản lượng theo kế hoạch') || find('%'), totalTime: null, actualTime: null
  };
  const timeCandidates = [];
  for (const [column, label] of map.entries()) if (label.includes('thời gian') || label === 'thời gian') timeCandidates.push(column);
  const timeRules = { CAN: [6], EP: [7], XLBV: [11], GC: [7, 8], MAI: [9, 10], DO: [8, 9], K1: [14], K2: [22, 23], SX3: [8, 9] };
  const preferred = timeRules[processCode] || [];
  cols.totalTime = preferred[0] || timeCandidates[0] || null; cols.actualTime = preferred[1] || timeCandidates[1] || cols.totalTime;
  return { map, cols };
}
function rawValue(report, key) {
  const value = report?.[key]; if (value !== undefined && value !== null) return value;
  const extra = report?.extra_data; if (!extra) return null;
  try { const parsed = typeof extra === 'string' ? JSON.parse(extra) : extra; return parsed?.[key] ?? null; } catch (_) { return null; }
}
function asDate(value) { if (!value) return null; const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function metric(report, key) {
  if (key === 'actual_output') return Number(report?.actual_output ?? 0); if (key === 'standard_output') return Number(report?.standard_output ?? 0); if (key === 'tt_ok') return Number(report?.tt_ok ?? 0); if (key === 'tt_ng') return Number(report?.tt_ng ?? 0);
  if (key === 'achievement_rate') { const standard = Number(report?.standard_output ?? 0), actual = Number(report?.actual_output ?? 0), time = Number(report?.actual_time ?? report?.total_time ?? 0); return standard > 0 && time > 0 ? actual / (standard * time) : 0; }
  return Number(report?.[key] ?? 0);
}
function writeDefectsAndDeductions(row, report, columnMap) {
  const defects = Array.isArray(report?.defects) ? report.defects : [], deductions = Array.isArray(report?.deductions) ? report.deductions : [];
  for (const [column, label] of columnMap.entries()) {
    const normalized = alias(label);
    const defect = defects.find((item) => alias(item?.defect_name || item?.name || item?.defect_code).includes(normalized) || normalized.includes(alias(item?.defect_name || item?.name || item?.defect_code)));
    if (defect) { row.getCell(column).value = Number(defect.quantity ?? defect.count ?? defect.value ?? 0); continue; }
    const deduction = deductions.find((item) => alias(item?.deduction_name || item?.name || item?.deduction_code).includes(normalized) || normalized.includes(alias(item?.deduction_name || item?.name || item?.deduction_code)));
    if (deduction) row.getCell(column).value = Number(deduction.hours ?? deduction.time ?? deduction.value ?? 0);
  }
}
function writeReportRow(sheet, rowNumber, report, processCode, mapping) {
  const row = sheet.getRow(rowNumber), c = mapping.cols; const set = (column, value) => { if (column) row.getCell(column).value = value == null ? null : value; };
  set(c.workerCode, report.worker_code); set(c.workerName, report.full_name || report.worker_name); set(c.shift, report.shift); set(c.machine, report.machine_no); set(c.product, report.product_name || rawValue(report, 'product_code')); set(c.workDate, asDate(report.work_date)); set(c.training, report.training_percent); set(c.standard, metric(report, 'standard_output')); set(c.actual, metric(report, 'actual_output')); set(c.ok, metric(report, 'tt_ok')); set(c.ng, metric(report, 'tt_ng')); set(c.achievement, metric(report, 'achievement_rate')); set(c.totalTime, metric(report, 'total_time')); if (c.actualTime && c.actualTime !== c.totalTime) set(c.actualTime, metric(report, 'actual_time')); writeDefectsAndDeductions(row, report, mapping.map);
}
function clearBrokenAndExternalFormulas(workbook) { let removed = 0; workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => { if (typeof cell.value === 'string' && cell.value.startsWith('=') && (cell.value.includes('#REF!') || /\[[^\]]+\][^!]+!/.test(cell.value))) { cell.value = null; removed += 1; } }))); return removed; }
function clearDetailConstants(sheet, startRow, endRow) { for (let r = startRow; r <= endRow; r += 1) { const row = sheet.getRow(r); for (let c = 1; c <= sheet.columnCount; c += 1) { const cell = row.getCell(c); if (typeof cell.value !== 'string' || !cell.value.startsWith('=')) cell.value = null; } } }

async function hydrateExportDetailFallbacks(reports) {
  if (!Array.isArray(reports) || !reports.length) return reports;
  const reportIds = reports.map((report) => Number(report.id)).filter(Number.isFinite);
  if (!reportIds.length) return reports;
  const placeholders = reportIds.map(() => '?').join(',');

  const [legacyRows, tempDeductionRows, tempDefectRows, machineDefectRows] = await Promise.all([
    query(`SELECT id, kqd_dap_lai, kqd_tuot, vo_do_long, xuoc_do_long, cong_gay, xoay, khong_dut, bavia_hut, ppcm, loi_cao_su, ng_kich_thuoc, cat_lem FROM production_reports WHERE id IN (${placeholders})`, reportIds),
    query(`SELECT pr.source_temp_id AS report_id, td.deduction_type_id, dt.deduction_code, dt.deduction_name, td.hours FROM production_reports pr INNER JOIN production_temp_deductions td ON td.temp_report_id=pr.source_temp_id LEFT JOIN deduction_types dt ON dt.id=td.deduction_type_id WHERE pr.id IN (${placeholders}) AND pr.source_temp_id IS NOT NULL`, reportIds),
    query(`SELECT pr.source_temp_id AS report_id, td.defect_type_id, dt.defect_code, dt.defect_name, td.quantity FROM production_reports pr INNER JOIN production_temp_defects td ON td.temp_report_id=pr.source_temp_id LEFT JOIN defect_types dt ON dt.id=td.defect_type_id WHERE pr.id IN (${placeholders}) AND pr.source_temp_id IS NOT NULL`, reportIds),
    query(`SELECT ml.report_id, md.machine_line_id, md.defect_type_id, md.defect_code, md.defect_name, md.quantity FROM production_report_machine_lines ml INNER JOIN production_report_machine_defects md ON md.machine_line_id=ml.id WHERE ml.report_id IN (${placeholders}) ORDER BY ml.report_id, md.id`, reportIds)
  ]);

  const legacyById = new Map(legacyRows.map((row) => [Number(row.id), row]));
  const tempDeductionsById = new Map();
  const tempDefectsById = new Map();
  const machineDefectsByReportId = new Map();
  for (const row of tempDeductionRows) { const id = Number(row.report_id); if (!tempDeductionsById.has(id)) tempDeductionsById.set(id, []); tempDeductionsById.get(id).push(row); }
  for (const row of tempDefectRows) { const id = Number(row.report_id); if (!tempDefectsById.has(id)) tempDefectsById.set(id, []); tempDefectsById.get(id).push(row); }
  for (const row of machineDefectRows) { const id = Number(row.report_id); if (!machineDefectsByReportId.has(id)) machineDefectsByReportId.set(id, []); machineDefectsByReportId.get(id).push(row); }

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
    const defectRows = existingDefects.length ? existingDefects : [...tempDefects, ...machineDefects];
    report.defects = mergeDefects(report, defectRows, Array.isArray(report.machineLines) ? report.machineLines : []);
  }
  return reports;
}

async function applyCurrentDbMasterData(reports) {
  if (!Array.isArray(reports) || !reports.length) return reports;
  const processId = Number(reports[0]?.process_id); if (!Number.isInteger(processId) || processId <= 0) return reports;
  const [standards, machines] = await Promise.all([
    query(`SELECT id, product_code, encoding_code, standard_output, exclude_kqd_from_tt FROM product_standards WHERE process_id=? AND LOWER(COALESCE(status,'active')) IN ('active','enabled','1') ORDER BY id`, [processId]),
    query(`SELECT id, machine_code FROM machines WHERE process_id=? AND LOWER(COALESCE(status,'active')) IN ('active','enabled','1') ORDER BY id`, [processId])
  ]);
  const normalize = (value) => String(value ?? '').trim().toUpperCase();
  const standardMap = new Map();
  for (const row of standards) { if (normalize(row.product_code)) standardMap.set(`P:${normalize(row.product_code)}`, row); if (normalize(row.encoding_code)) standardMap.set(`E:${normalize(row.encoding_code)}`, row); }
  const machineMap = new Map(machines.map((row) => [normalize(row.machine_code), row]));
  for (const report of reports) {
    const requestedProduct = String(rawValue(report, 'product_code') ?? report.product_name ?? '').trim();
    const key = normalize(requestedProduct); const standard = standardMap.get(`P:${key}`) || standardMap.get(`E:${key}`) || null;
    if (standard) {
      report.product_name = String(standard.product_code || requestedProduct).trim(); report.product_code = String(standard.product_code || requestedProduct).trim();
      const dbStandard = Number(standard.standard_output); if (Number.isFinite(dbStandard) && dbStandard > 0) report.standard_output = dbStandard;
      if (standard.exclude_kqd_from_tt !== null && standard.exclude_kqd_from_tt !== undefined) report.exclude_kqd_from_tt = Number(standard.exclude_kqd_from_tt) === 1 ? 1 : 0;
    }
    const requestedMachine = String(report.machine_no ?? '').trim();
    if (!requestedMachine) { report.machine_no = null; report.exportWorkType = 'LỒNG'; continue; }
    const machine = machineMap.get(normalize(requestedMachine));
    if (machine) { report.machine_no = machine.machine_code; report.exportWorkType = 'MÁY'; }
    else report.exportWorkType = 'MÁY_KHÔNG_CÒN_TRONG_DB';
  }
  return reports;
}

async function buildTemplateDrivenProcessWorkbook(reports, yearMonth, options = {}) {
  const processCode = String(reports?.[0]?.process_code || options.processCode || '').toUpperCase();
  const contract = getProcessTemplateContract(processCode); const templatePath = await resolveTemplatePath(); const workbook = new ExcelJS.Workbook(); await workbook.xlsx.readFile(templatePath);
  const sheet = workbook.getWorksheet(contract.sheet); if (!sheet) throw Object.assign(new Error(`File mẫu thiếu sheet ${contract.sheet}`), { code: 'KTC_EXCEL_TEMPLATE_SHEET_MISSING', statusCode: 500 });
  if ((reports?.length || 0) > contract.dataEndRow - contract.dataStartRow + 1) throw Object.assign(new Error(`File mẫu ${contract.sheet} chỉ có ${contract.dataEndRow - contract.dataStartRow + 1} dòng chi tiết; tháng ${yearMonth} có ${reports.length} báo cáo`), { code: 'KTC_EXCEL_TEMPLATE_CAPACITY_EXCEEDED', statusCode: 422 });
  await hydrateExportDetailFallbacks(reports);
  await applyCurrentDbMasterData(reports);
  const mapping = processColumns(sheet, contract, processCode); clearDetailConstants(sheet, contract.dataStartRow, contract.dataEndRow);
  for (let index = 0; index < (reports || []).length; index += 1) writeReportRow(sheet, contract.dataStartRow + index, reports[index], processCode, mapping);
  const removedBrokenFormulas = clearBrokenAndExternalFormulas(workbook); workbook.calculation = { fullCalcOnLoad: true, forceFullCalc: true, calcMode: 'auto' };
  const exportRoot = options.exportRoot || path.join(process.cwd(), 'exports-process'); const [year, month] = String(yearMonth).split('-'); const folder = path.join(exportRoot, year, options.processName || processCode, month); await fs.mkdir(folder, { recursive: true });
  const fileName = options.fileName || `Bao-cao-${processCode}-${month}-${year}.xlsx`; const outputPath = path.join(folder, fileName); await workbook.xlsx.writeFile(outputPath);
  return { archivePath: outputPath, fileName, processCode, templateFile: path.basename(templatePath), templateSheet: contract.sheet, templateHeaderRow: contract.headerRow, dataStartRow: contract.dataStartRow, reportCount: reports.length, removedBrokenFormulas };
}

module.exports = { buildTemplateDrivenProcessWorkbook, applyCurrentDbMasterData };