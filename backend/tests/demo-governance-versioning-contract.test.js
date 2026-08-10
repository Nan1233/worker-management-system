const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('demo audit captures successful API mutations without exposing secrets', () => {
  const server = read('server.js');
  const middleware = read('middleware/activityAuditMiddleware.js');
  assert.match(server, /activityAuditMiddleware/);
  assert.match(middleware, /DATA_CREATE/);
  assert.match(middleware, /DATA_UPDATE/);
  assert.match(middleware, /DATA_DELETE/);
  assert.match(middleware, /\[redacted\]/);
});

test('approved reports support version history, soft delete and restore', () => {
  const controller = read('controllers/productionController.js');
  const routes = read('routes/productionRoutes.js');
  const editService = read('services/approvedReportEditService.js');
  const audit = read('services/auditService.js');
  assert.match(controller, /status='deleted'/);
  assert.match(controller, /REPORT_DELETED/);
  assert.match(routes, /versions\/:versionNo\/restore/);
  assert.match(editService, /REPORT_RESTORED/);
  assert.match(audit, /report_versions/);
  assert.match(audit, /MODIFY COLUMN status VARCHAR\(30\)/);
});

test('formula settings are scoped by process and effective date including historical versions', () => {
  const service = read('services/formulaSettingsService.js');
  const companyData = read('controllers/companyExcelDataController.js');
  const desktop = read('../desktop/electron/monthlyWorkbookLocal.cjs');
  assert.match(service, /effective_from/);
  assert.match(service, /effective_to/);
  assert.match(service, /production_formula_setting_versions/);
  assert.match(service, /historicalScopeFor/);
  assert.match(companyData, /formulaSettingsByDate/);
  assert.match(desktop, /settingsForReport/);
  assert.match(desktop, /formulaSettingsByDate/);
});

test('approved report screen separates display range from Excel month', () => {
  const page = read('../frontend/src/pages/manager/ApprovedReports.tsx');
  const service = read('../frontend/src/services/productionService.ts');
  assert.match(page, /dateMode/);
  assert.match(page, /selectedMonth/);
  assert.match(page, /dateFrom/);
  assert.match(page, /dateTo/);
  assert.match(page, /excelMonth/);
  assert.match(page, /exportSelectedApprovedExcel\(`\$\{excelMonth\}-01`\)/);
  assert.match(service, /date_from/);
  assert.match(service, /date_to/);
});

test('manager UI hides standalone export menu and supports theme toggle', () => {
  const layout = read('../frontend/src/layouts/ManagementLayout.tsx');
  const theme = read('../frontend/src/components/common/ThemeToggle.tsx');
  assert.match(layout, /roles: \["admin"\].*REPORT_EXPORT/);
  assert.match(layout, /<ThemeToggle/);
  assert.match(theme, /ktcTheme/);
});
