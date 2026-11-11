'use strict';

const { normalizeLabel } = require('./excelTemplateContractService');
const TEMPLATE_SHEETS = ['CÁN', 'EP', 'XLBV', 'Cắt lồng', 'TT Mài', 'TT Đo', 'TT Kiểm 1', 'TT Kiểm 2'];
const PROCESS_ALIASES = [
  ['can', 'CÁN'], ['ep', 'EP'], ['xlbv', 'XLBV'], ['cat long', 'Cắt lồng'],
  ['mai', 'TT Mài'], ['do', 'TT Đo'], ['kiem 1', 'TT Kiểm 1'], ['kiem 2', 'TT Kiểm 2']
];
function sheetForProcess(name) {
  const label = normalizeLabel(name);
  const found = PROCESS_ALIASES.find(([key]) => label.includes(normalizeLabel(key)));
  return found ? found[1] : null;
}
function safeSheetName(name) {
  const cleaned = String(name || 'BC công đoạn').replace(/[\\/*?:\[\]]/g, ' ').trim();
  return cleaned.slice(0, 31) || 'BC công đoạn';
}
function groupReportsByProcessSheet(reports) {
  const grouped = new Map();
  for (const report of reports) {
    const sheetName = sheetForProcess(report.process_name) || safeSheetName(report.process_name || 'BC công đoạn');
    if (!grouped.has(sheetName)) grouped.set(sheetName, []);
    grouped.get(sheetName).push(report);
  }
  return grouped;
}
function getProcessDetailTypes(items) {
  const processDeductions = [...new Map(items.flatMap((r) => r.excelExportTimes?.hasMachine ? r.excelExportTimes.deductions : (r.deductions || [])).map((x) => [Number(x.deduction_type_id || x.id), x])).values()].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id || a.deduction_type_id || 0) - Number(b.id || b.deduction_type_id || 0));
  const processDefects = [...new Map(items.flatMap((r) => r.defects || []).map((x) => [Number(x.defect_type_id || x.id), x])).values()].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id || a.defect_type_id || 0) - Number(b.id || b.defect_type_id || 0));
  return { processDeductions, processDefects };
}
module.exports = { TEMPLATE_SHEETS, sheetForProcess, safeSheetName, groupReportsByProcessSheet, getProcessDetailTypes };
