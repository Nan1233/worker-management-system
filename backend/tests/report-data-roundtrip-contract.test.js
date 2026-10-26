'use strict';

// Regression contract for report-data preservation across pending -> approved -> Excel.
// Static contract only: no local commands and no database writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('approval copies all persisted child collections before marking the temp report approved', () => {
  const approval = read('models/productionTempApprovalModel.js');

  const mainInsert = approval.indexOf('INSERT INTO production_reports');
  const defectsCopy = approval.indexOf('INSERT INTO production_report_defects');
  const deductionsCopy = approval.indexOf('INSERT INTO production_report_deductions');
  const machineCopy = approval.indexOf('copyMachineLinesToApproved(item.id, approvedReportId');
  const tempApproved = approval.indexOf("SET status='approved',reviewed_by=?,approved_at=NOW(),updated_at=NOW()");
  const commit = approval.indexOf('await commit(connection)', tempApproved);

  assert.ok(mainInsert >= 0, 'approved parent report is inserted');
  assert.ok(defectsCopy > mainInsert, 'defect details are copied after parent insert');
  assert.ok(deductionsCopy > defectsCopy, 'deduction details are copied after defect details');
  assert.ok(machineCopy > deductionsCopy, 'machine lines and machine defects are copied');
  assert.ok(tempApproved > machineCopy, 'temp status is marked approved only after child copies');
  assert.ok(commit > tempApproved, 'the transaction commits after status and detail writes');
  assert.match(approval, /createApprovedReportVersion\(/, 'approved version snapshot is created');
  assert.match(approval, /loadTempReportSnapshot\(/, 'pre-approval temp snapshot is retained');
});

test('monthly Excel is sourced only from approved parent reports and joins child details by approved report id', () => {
  const excel = read('services/processExcelExportService.js');
  assert.match(excel, /FROM production_reports AS pr/);
  assert.match(excel, /LOWER\(TRIM\(COALESCE\(pr\.status, ''\)\)\) = 'approved'/);
  assert.match(excel, /production_report_deductions/);
  assert.match(excel, /production_report_defects/);
  assert.match(excel, /production_report_machine_lines/);
  const templateExcel = read('services/templateDrivenProcessExcelExportService.js');
  assert.match(templateExcel, /production_report_machine_defects/);
  assert.match(templateExcel, /machineDefectsByLineId/);
  assert.match(excel, /WHERE pr\.work_date >= \?\s+AND pr\.work_date < \?/);
});

test('approved manager list has a matching count query and stable unique pagination order', () => {
  const controller = read('controllers/managerApprovedReportsController.js');
  assert.match(controller, /SELECT COUNT\(\*\) AS total[\s\S]*?FROM production_reports pr/);
  assert.match(controller, /LOWER\(TRIM\(COALESCE\(pr\.status,''\)\)\)='approved'/);
  assert.match(controller, /LIMIT \$\{pageSize\} OFFSET \$\{offset\}/);
  assert.match(controller, /ORDER BY[\s\S]*?pr\.id/);
});

test('report history retains child machine details and ordinary defect/deduction details', () => {
  const audit = read('services/auditService.js');
  assert.match(audit, /production_temp_machine_lines/);
  assert.match(audit, /production_temp_machine_defects/);
  assert.match(audit, /production_temp_defects/);
  assert.match(audit, /production_temp_deductions/);
  assert.match(audit, /machine_lines:/);
});
