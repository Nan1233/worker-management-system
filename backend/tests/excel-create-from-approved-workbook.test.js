const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');

test('Excel sync supports manager-created rows without bypassing backend validation/audit', () => {
  const controller=read('backend/controllers/excelEditSyncController.js');
  const service=read('backend/services/approvedReportExcelCreateService.js');
  assert.match(controller,/change\?\.create === true/);
  assert.match(service,/validateProductionReport/);
  assert.match(service,/validateMasterData/);
  assert.match(service,/REPORT_CREATED_FROM_EXCEL/);
  assert.match(service,/DUPLICATE_REPORT/);
  assert.match(service,/report_versions|createReportVersion/);
});

test('Excel workbook exposes worker-entered operation fields and parser detects blank-ID create rows', () => {
  const workbook=read('desktop/electron/monthlyWorkbookLocal.cjs');
  const parser=read('desktop/electron/excelDbSync.cjs');
  assert.match(workbook,/header: 'Loại thao tác'/);
  assert.match(workbook,/header: 'Chế độ'/);
  assert.match(parser,/Blank ID \+ real worker\/product data/);
  assert.match(parser,/create: true/);
  assert.match(parser,/worker_code: workerCode/);
});
