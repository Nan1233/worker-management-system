'use strict';

const { expandGiaCongMachineLines } = require('./gcCommonProcessExcelRows');
const { resolveReportExportTimes } = require('./commonProcessExportTimes');
function num(value) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function dateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function prepareCommonProcessExcelReports(reports) {
  const reportList = expandGiaCongMachineLines(reports).sort((a, b) =>
    dateKey(a.work_date).localeCompare(dateKey(b.work_date))
    || String(a.worker_code || '').localeCompare(String(b.worker_code || ''), undefined, { numeric: true })
    || Number(a.id) - Number(b.id)
    || num(a._gcMachineLineId) - num(b._gcMachineLineId));
  for (const report of reportList) {
    if (!report.excelExportTimes) report.excelExportTimes = resolveReportExportTimes(report);
  }
  return reportList;
}
module.exports = { dateKey, prepareCommonProcessExcelReports };
