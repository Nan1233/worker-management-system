'use strict';

const { expandGiaCongMachineLines } = require('./gcCommonProcessExcelRows');
const { resolveReportExportTimes } = require('./commonProcessExportTimes');

function finiteNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function dateKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function compareReportsForExport(left, right) {
  const dateComparison = dateKey(left.work_date).localeCompare(dateKey(right.work_date));
  if (dateComparison) return dateComparison;

  const workerComparison = String(left.worker_code || '').localeCompare(
    String(right.worker_code || ''),
    undefined,
    { numeric: true }
  );
  if (workerComparison) return workerComparison;

  const reportComparison = Number(left.id) - Number(right.id);
  if (reportComparison) return reportComparison;

  return finiteNumber(left._gcMachineLineId) - finiteNumber(right._gcMachineLineId);
}

function prepareCommonProcessExcelReports(reports) {
  const reportList = expandGiaCongMachineLines(reports).sort(compareReportsForExport);

  for (const report of reportList) {
    if (!report.excelExportTimes) {
      report.excelExportTimes = resolveReportExportTimes(report);
    }
  }

  return reportList;
}

module.exports = { dateKey, prepareCommonProcessExcelReports };
