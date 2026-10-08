const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('desktop and backend calculation engines expose the current calculation contract', () => {
  const backend = fs.readFileSync(path.join(__dirname, '../domain/productionCalculationEngine.cjs'), 'utf8');
  const desktop = fs.readFileSync(path.join(__dirname, '../../desktop/electron/productionCalculationEngine.cjs'), 'utf8');
  for (const source of [backend, desktop]) {
    assert.match(source, /calculateProductionMetrics/);
    assert.match(source, /calculateReportPerformance|calculateActualOutput|calculateAdjustedOutput/);
  }
});

test('company-data API uses split-workbook contract without per-report Worker snapshots', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/companyExcelDataController.js'), 'utf8');
  const loader = fs.readFileSync(path.join(__dirname, '../services/bulkCompanyExcelDataService.js'), 'utf8');
  assert.match(controller, /mode:\s*'SPLIT_MONTHLY_WORKBOOKS'/);
  assert.match(controller, /calculationContractVersion:\s*2/);
  assert.match(loader, /pr\.exclude_kqd_from_tt_snapshot/);
  assert.doesNotMatch(loader, /calculateProductionMetrics\(report/);
});

test('company-data contract preserves approved database snapshots for Desktop calculation', () => {
  const loader = fs.readFileSync(path.join(__dirname, '../services/bulkCompanyExcelDataService.js'), 'utf8');
  assert.match(loader, /pr\.actual_time/);
  assert.match(loader, /pr\.actual_output/);
  assert.match(loader, /pr\.tt_ok/);
  assert.match(loader, /pr\.tt_ng/);
  assert.match(loader, /pr\.exclude_kqd_from_tt_snapshot/);
  assert.match(loader, /production_report_machine_lines/);
});

test('company-data advertises the current split workbook contract', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/companyExcelDataController.js'), 'utf8');
  assert.match(controller, /mode:\s*'SPLIT_MONTHLY_WORKBOOKS'/);
  assert.match(controller, /expectedFileCount:\s*PROCESS_CODES\.length \+ 1/);
  assert.match(controller, /calculationContractVersion:\s*2/);
});
