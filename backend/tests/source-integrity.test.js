const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('authentication sessions are finite', () => {
  const source = read('controllers/authController.js');
  assert.doesNotMatch(source, /2099-12-31/);
  assert.match(source, /REFRESH_TOKEN_TTL_DAYS/);
});

test('company Excel endpoints are mounted through report router', () => {
  const server = read('server.js');
  const routes = read('routes/reportExportRoutes.js');
  assert.match(server, /reportExportRoutes/);
  assert.match(routes, /company-data/);
});

test('production startup validates critical environment before database startup', () => {
  const server = read('server.js');
  const validator = read('config/validateEnvironment.js');
  assert.match(server, /validateEnvironment\(process\.env, \{ production: isProduction \}\)/);
  assert.match(validator, /'JWT_SECRET'/);
  assert.match(validator, /'DB_PASSWORD'/);
  assert.match(validator, /ENVIRONMENT_VALIDATION_FAILED/);
});

test('heavy Excel exports use one worker-thread job manager', () => {
  const controller = read('controllers/desktopExcelExportController.js');
  const manager = read('services/excelExportJobManager.js');
  assert.match(controller, /excelJobManager\.run\('process'/);
  assert.match(controller, /excelJobManager\.run\('company'/);
  assert.match(manager, /let activeJobId = null/);
});

test('Excel exports enforce report volume limits', () => {
  const guard = read('services/excelExportGuards.js');
  assert.match(guard, /EXCEL_MAX_REPORTS_PER_MONTH/);
  assert.match(guard, /EXCEL_MAX_REPORTS_PER_DAY/);
});

test('process Excel exports stay separate from company workbooks', () => {
  const source = read('services/processExcelExportService.js');
  assert.doesNotMatch(source, /buildMaiDoCompanyWorkbook/);
  assert.match(source, /Bao-cao-\$\{slugName\(processName\)\}-\$\{month\}-\$\{year\}\.xlsx/);
});

test('process list includes every active process even without reports', () => {
  const source = read('services/processExcelExportService.js');
  assert.match(source, /LEFT JOIN production_reports pr/);
  assert.doesNotMatch(source, /HAVING COUNT\(pr\.id\) > 0/);
});

test('manual Desktop Excel sync is serialized and uses renderer token', () => {
  const source = read('../desktop/electron/main.cjs');
  assert.match(source, /waitForUsableRendererToken/);
  assert.match(source, /let manualSyncTail = Promise\.resolve\(\)/);
  assert.match(source, /MANUAL_EXCEL_SYNC_DEQUEUED/);
});

test('frontend rejects skipped Desktop sync results', () => {
  assert.match(read('../frontend/src/services/productionService.ts'), /if \(result\?\.skipped\)/);
});

test('monthly workbook contains all nine production processes', () => {
  const monthly = read('../desktop/electron/monthlyWorkbookLocal.cjs');
  const companyData = read('controllers/companyExcelDataController.js');
  for (const code of ['CAN','EP','XLBV','GC','MAI','DO','K1','K2','SX3']) {
    assert.match(monthly, new RegExp(`\\b${code}:\\s*\\{`));
  }
  for (const sheet of ['CÁN','ÉP','XỬ LÝ BAVIA','CẮT LỒNG','MÀI','ĐO','KIỂM 1','KIỂM 2','SẢN XUẤT 3']) {
    assert.ok(monthly.includes(`sheet: '${sheet}'`), `missing sheet ${sheet}`);
  }
  assert.match(companyData, /PROCESS_CODES = \['CAN','EP','XLBV','GC','MAI','DO','K1','K2','SX3'\]/);
});

test('monthly workbook is rebuilt cleanly and never imports sample rows', () => {
  const source = read('../desktop/electron/monthlyWorkbookLocal.cjs');
  assert.match(source, /const workbook = new ExcelJS\.Workbook\(\)/);
  assert.match(source, /workbook\.addWorksheet\('BÌA'/);
  assert.match(source, /addSummary\(workbook/);
  assert.match(source, /addReconciliationSheet\(workbook/);
  assert.doesNotMatch(source, /xlsx\.readFile/);
  assert.doesNotMatch(source, /Nguyễn Thị A|Trần Văn B/);
  assert.doesNotMatch(source, /spliceRows|sanitizeWorkbookXml|cloneCellPresentation/);
});

test('monthly process columns are generated from process-specific master types', () => {
  const source = read('../desktop/electron/monthlyWorkbookLocal.cjs');
  assert.match(source, /processDetailTypes\(code, processData, 'deductionTypes', 'deductions', 'deduction'\)/);
  assert.match(source, /processDetailTypes\(code, processData, 'defectTypes', 'defects', 'defect'\)/);
  assert.match(source, /deductionTypes\.forEach/);
  assert.match(source, /defectTypes\.forEach/);
  assert.match(source, /detailMap\(report\.deductions, 'deduction'\)/);
  assert.match(source, /detailMap\(report\.defects, 'defect'\)/);
});

test('monthly workbook keeps time details beside time and NG beside result', () => {
  const source = read('../desktop/electron/monthlyWorkbookLocal.cjs');
  const start = source.indexOf('function makeColumns');
  const end = source.indexOf('function groupStyle', start);
  const block = source.slice(start, end);
  assert.ok(block.indexOf("key: 'deductionTime'") < block.indexOf('deductionTypes.forEach'));
  assert.ok(block.indexOf('deductionTypes.forEach') < block.indexOf("key: 'ok'"));
  assert.ok(block.indexOf("key: 'ng'") < block.indexOf('defectTypes.forEach'));
  assert.ok(block.indexOf('defectTypes.forEach') < block.indexOf("key: 'output'"));
});

test('monthly workbook only accepts approved TiDB database payload', () => {
  const service = read('services/processExcelExportService.js');
  const source = read('../desktop/electron/monthlyWorkbookLocal.cjs');
  assert.match(service, /FROM production_reports AS pr/);
  assert.match(service, /LOWER\(TRIM\(COALESCE\(pr\.status, ''\)\)\) = 'approved'/);
  assert.match(service, /report\.dataSource = 'production_reports'/);
  assert.match(source, /payload\.dataSource !== 'tidb\.production_reports\.approved'/);
  assert.match(source, /report\?\.isApprovedDatabaseRecord !== true/);
});

test('monthly workbook uses database snapshots and report_id details', () => {
  const service = read('services/processExcelExportService.js');
  const source = read('../desktop/electron/monthlyWorkbookLocal.cjs');
  const engine = read('domain/productionCalculationEngine.cjs');
  assert.match(service, /WHERE prd\.report_id IN/);
  assert.match(service, /report\.deductions = deductions\.get\(id\) \|\| \[\]/);
  assert.match(service, /report\.defects = defects\.get\(id\) \|\| \[\]/);
  assert.match(
    engine,
    /const enteredOutput = asInteger\(report\.actual_output \?\? fallbackEnteredOutput\)/,
    'SP nhập phải được chuẩn hóa thành số nguyên'
  );
  assert.match(
    engine,
    /const ok = asInteger\(report\.tt_ok\)/,
    'OK phải được chuẩn hóa thành số nguyên'
  );
  assert.match(
    engine,
    /const total = asInteger\(report\.tt_ng\)/,
    'Tổng NG phải được chuẩn hóa thành số nguyên'
  );
  assert.match(
    engine,
    /return output === null \? null : Math\.round\(output\)/,
    'SP quy đổi phải được làm tròn thành số nguyên'
  );
  assert.match(source, /INTEGER:\s*'#,##0;-#,##0;0'/);
  assert.match(source, /DECIMAL:\s*'#,##0\.##;-#,##0\.##;0'/);
  assert.match(source, /RATE:\s*'#,##0\.######;-#,##0\.######;0'/);
  assert.match(engine, /asNumber\(report\.standard_output\)/);
  assert.match(source, /productDisplay\(report\)/);
  assert.doesNotMatch(source, /training_percent\s*\|\|\s*100/);
});

test('reconciliation sheet validates detail totals against report snapshots', () => {
  const source = read('../desktop/electron/monthlyWorkbookLocal.cjs');
  assert.match(source, /Cộng chi tiết trừ/);
  assert.match(source, /Cộng chi tiết NG/);
  assert.match(source, /Math\.abs\(deductionDiff\)/);
  assert.match(source, /Math\.abs\(ngDiff\)/);
});

test('release source has one Electron implementation and no generated archives', () => {
  assert.equal(fs.existsSync(path.join(root, 'electron')), false);
  assert.equal(fs.existsSync(path.join(root, 'templates.zip')), false);
});

test('desktop monthly export is split into one summary file and nine process files', () => {
  const monthly = read('../desktop/electron/monthlyWorkbookLocal.cjs');
  const desktopMain = read('../desktop/electron/main.cjs');
  assert.match(monthly, /buildSplitMonthlyWorkbooksLocal/);
  assert.match(monthly, /00_TONG_HOP_SAN_XUAT_/);
  for (const prefix of ['01_CAN','02_EP','03_XU_LY_BAVIA','04_CAT_LONG','05_MAI','06_DO','07_KIEM_1','08_KIEM_2','09_SAN_XUAT_3']) {
    assert.ok(monthly.includes(`'${prefix}'`), `missing split workbook prefix ${prefix}`);
  }
  assert.match(desktopMain, /MONTHLY_SPLIT_WORKBOOKS_START/);
  assert.match(desktopMain, /buildSplitMonthlyWorkbooksLocal/);
  assert.match(desktopMain, /expectedFileCount = Object\.keys\(PROCESS_SHEETS\)\.length \+ 1/);
});
