const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('desktop fallback calculation engine is byte-identical to backend canonical engine', () => {
  const backend = fs.readFileSync(path.join(__dirname, '../domain/productionCalculationEngine.cjs'), 'utf8');
  const desktop = fs.readFileSync(path.join(__dirname, '../../desktop/electron/productionCalculationEngine.cjs'), 'utf8');
  assert.equal(desktop, backend, 'Desktop engine mirror must be copied from backend canonical engine');
});

test('company-data API attaches backend calculationSnapshot and desktop prefers it', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/companyExcelDataController.js'), 'utf8');
  const desktop = fs.readFileSync(path.join(__dirname, '../../desktop/electron/monthlyWorkbookLocal.cjs'), 'utf8');
  assert.match(controller, /calculationSnapshot:\s*calculateProductionMetrics\(report, settings\)/);
  assert.match(desktop, /report\.calculationSnapshot\s*\|\|\s*calculateProductionMetrics\(report, settings\)/);
});

test('company-data loader carries product KQD policy and multi-machine aggregate into canonical snapshot', () => {
  const loader = fs.readFileSync(path.join(__dirname, '../services/processExcelExportService.js'), 'utf8');
  assert.match(loader, /LEFT JOIN product_standards AS ps/);
  assert.match(loader, /COALESCE\(ps\.exclude_kqd_from_tt, 0\) AS exclude_kqd_from_tt/);
  assert.match(loader, /calculateReportPerformance\(\{/);
  assert.match(loader, /machineLines:\s*report\.machineLines/);
  assert.match(loader, /Object\.assign\(report, calculateReportPerformance/);
});


test('company-data advertises the current split workbook contract', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/companyExcelDataController.js'), 'utf8');
  assert.match(controller, /mode:\s*'SPLIT_MONTHLY_WORKBOOKS'/);
  assert.match(controller, /expectedFileCount:\s*PROCESS_CODES\.length \+ 1/);
  assert.match(controller, /calculationContractVersion:\s*2/);
});
