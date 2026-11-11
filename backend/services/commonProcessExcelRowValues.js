'use strict';
const { resolveReportExportTimes } = require('./commonProcessExportTimes');
const { detailValue } = require('./commonProcessExcelDetailValue');
const { dateKey } = require('./commonProcessExcelReportPreparation');
const { MAX_DEDUCTIONS, MAX_DEFECTS, LAST_COLUMN } = require('./commonProcessExcelColumns');
function num(value) { const n = Number(value ?? 0); return Number.isFinite(n) ? n : 0; }
function buildCommonProcessExcelRowValues(report, deductionTypes, defectTypes, index) {
  const exportTimes = report.excelExportTimes || resolveReportExportTimes(report);
  const totalTime = exportTimes.totalHours;
  const actualTime = exportTimes.actualHours;
  const deductionTime = exportTimes.deductionHours;

  // Business rule for Excel:
  //   Định mức = Định mức SP/h × số giờ thực tế
  //   % định mức = TT / Định mức × % học việc
  // The training percentage is the immutable snapshot captured at report time.
  const standardRate = num(report.standard_output);
  const actual = num(report.actual_output || (num(report.tt_ok) + num(report.tt_ng)));
  const trainingPercent = Math.min(100, Math.max(0, num(report.training_percent ?? report.training_percent_snapshot)));
  const trainingFactor = trainingPercent / 100;
  const standard = standardRate * actualTime;
  const achievement = standard > 0 ? (actual / standard) * trainingFactor : 0;
  const ok = num(report.tt_ok);
  const ng = num(report.tt_ng);
  const ngRate = actual > 0 ? ng / actual : 0;
  const deductions = Array.isArray(exportTimes.deductions) ? exportTimes.deductions : [];
  const defects = Array.isArray(report.defects) ? report.defects : [];

  const deductionValues = deductionTypes.slice(0, MAX_DEDUCTIONS).map((t) => detailValue(deductions, t.id, t.name, 'hours'));
  const defectValues = defectTypes.slice(0, MAX_DEFECTS).map((t) => detailValue(defects, t.id, t.name, 'quantity'));
  // All common-process worksheets use the same fixed 53-column template.
  // Padding both detail blocks prevents production totals and dates shifting
  // into the wrong columns when a process has fewer active deduction/NG types.
  while (deductionValues.length < MAX_DEDUCTIONS) deductionValues.push(null);
  while (defectValues.length < MAX_DEFECTS) defectValues.push(null);
  const workDate = dateKey(report.work_date);
  const values = [
    index + 1, report.worker_code ?? '', report.full_name ?? report.worker_name ?? '', report.machine_no ?? '', report.shift ?? '',
    trainingFactor, totalTime, actualTime,
    detailValue(deductions, null, 'Chuyển mã', 'hours'), deductionTime, Math.max(0, standard - actual),
    ...deductionValues,
    report.product_name ?? '', standard, actual, achievement,
    workDate ? new Date(`${workDate}T00:00:00`) : null,
    standardRate, ok, ng, ngRate,
    ...defectValues, ok, ng
  ];

  if (values.length !== LAST_COLUMN) {
    throw new Error(`Invalid common-process Excel row width: expected ${LAST_COLUMN}, received ${values.length}`);
  }
  return values;
}
module.exports = { buildCommonProcessExcelRowValues };
