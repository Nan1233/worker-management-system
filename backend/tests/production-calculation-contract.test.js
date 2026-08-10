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
