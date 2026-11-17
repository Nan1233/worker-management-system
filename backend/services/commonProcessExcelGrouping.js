'use strict';

const { normalizeLabel } = require('./excelTemplateContractService');

const TEMPLATE_SHEETS = ['CÁN', 'EP', 'XLBV', 'Cắt lồng', 'TT Mài', 'TT Đo', 'TT Kiểm 1', 'TT Kiểm 2'];
const PROCESS_ALIASES = [
  ['can', 'CÁN'], ['ep', 'EP'], ['xlbv', 'XLBV'], ['cat long', 'Cắt lồng'],
  ['mai', 'TT Mài'], ['do', 'TT Đo'], ['kiem 1', 'TT Kiểm 1'], ['kiem 2', 'TT Kiểm 2']
];

function sheetForProcess(name) {
  const normalizedName = normalizeLabel(name);
  const match = PROCESS_ALIASES.find(([alias]) => normalizedName.includes(normalizeLabel(alias)));
  return match ? match[1] : null;
}

function safeSheetName(name) {
  const cleaned = String(name || 'BC công đoạn').replace(/[\\/*?:\[\]]/g, ' ').trim();
  return cleaned.slice(0, 31) || 'BC công đoạn';
}

function groupReportsByProcessSheet(reports) {
  const grouped = new Map();

  for (const report of reports) {
    const sheetName = sheetForProcess(report.process_name)
      || safeSheetName(report.process_name || 'BC công đoạn');

    if (!grouped.has(sheetName)) grouped.set(sheetName, []);
    grouped.get(sheetName).push(report);
  }

  return grouped;
}

function detailTypeId(detail, typeIdKey) {
  return Number(detail[typeIdKey] || detail.id);
}

function compareDetailTypes(left, right, typeIdKey) {
  return Number(left.sort_order || 0) - Number(right.sort_order || 0)
    || Number(left.id || left[typeIdKey] || 0) - Number(right.id || right[typeIdKey] || 0);
}

// Preserve legacy behavior: the last detail with the same numeric ID wins.
function uniqueSortedDetailTypes(details, typeIdKey) {
  const byId = new Map(details.map((detail) => [detailTypeId(detail, typeIdKey), detail]));
  return [...byId.values()].sort((left, right) => compareDetailTypes(left, right, typeIdKey));
}

function getProcessDetailTypes(items) {
  const deductions = items.flatMap((report) =>
    report.excelExportTimes?.hasMachine
      ? report.excelExportTimes.deductions
      : (report.deductions || [])
  );
  const defects = items.flatMap((report) => report.defects || []);

  return {
    processDeductions: uniqueSortedDetailTypes(deductions, 'deduction_type_id'),
    processDefects: uniqueSortedDetailTypes(defects, 'defect_type_id')
  };
}

module.exports = {
  TEMPLATE_SHEETS,
  sheetForProcess,
  safeSheetName,
  groupReportsByProcessSheet,
  getProcessDetailTypes
};
