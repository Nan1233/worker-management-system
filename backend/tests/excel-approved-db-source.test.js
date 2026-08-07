const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const service = fs.readFileSync(path.join(__dirname, '..', 'services', 'processExcelExportService.js'), 'utf8');
const workbook = fs.readFileSync(path.join(__dirname, '..', '..', 'desktop', 'electron', 'monthlyWorkbookLocal.cjs'), 'utf8');

test('monthly Excel uses approved production_reports and report_id details only', () => {
  assert.match(service, /FROM production_reports AS pr/);
  assert.match(service, /LOWER\(TRIM\(COALESCE\(pr\.status, ''\)\)\) = 'approved'/);
  assert.match(service, /WHERE prd\.report_id IN/);
  assert.match(service, /report\.dataSource = 'production_reports'/);
  assert.match(workbook, /tidb\.production_reports\.approved/);
  assert.match(workbook, /reportSnapshot\(report, settings\)/);
  assert.match(workbook, /detailMap\(report\.deductions/);
  assert.match(workbook, /detailMap\(report\.defects/);
});
