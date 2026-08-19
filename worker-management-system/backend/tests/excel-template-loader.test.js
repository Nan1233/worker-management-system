const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const monthlyWorkbookPath = path.join(root, 'desktop', 'electron', 'monthlyWorkbookLocal.cjs');
const desktopPackagePath = path.join(root, 'desktop', 'package.json');
const smokeScriptPath = path.join(root, 'desktop', 'scripts', 'smokeExcel.cjs');

const monthlySource = fs.readFileSync(monthlyWorkbookPath, 'utf8');
const desktopPackage = JSON.parse(fs.readFileSync(desktopPackagePath, 'utf8'));
const smokeSource = fs.readFileSync(smokeScriptPath, 'utf8');

test('monthly workbook uses a clean ExcelJS renderer without runtime template mutation', () => {
  assert.match(monthlySource, /new ExcelJS\.Workbook\(\)/);
  assert.match(monthlySource, /assertApprovedDatabasePayload/);
  assert.match(monthlySource, /tidb\.production_reports\.approved/);
  assert.match(monthlySource, /workbook\.addWorksheet\(/);
  assert.doesNotMatch(monthlySource, /Bao-cao-san-xuat-template\.xlsx/);
  assert.doesNotMatch(monthlySource, /sanitizeWorkbookXml/);
  assert.doesNotMatch(monthlySource, /sheetNo/);
  assert.doesNotMatch(monthlySource, /spliceRows\(/);
});

test('desktop validates generated workbooks with smoke test before packaging', () => {
  const scripts = desktopPackage.scripts || {};

  assert.match(String(scripts['build:frontend'] || ''), /copy:frontend/);
  assert.match(String(scripts['dist:portable'] || ''), /smoke:excel/);
  assert.match(String(scripts['dist:nsis'] || ''), /smoke:excel/);
  assert.match(String(scripts['dist:win'] || ''), /smoke:excel/);
  assert.match(String(scripts['smoke:excel'] || ''), /smokeExcel\.cjs/);

  assert.match(smokeSource, /buildSplitMonthlyWorkbooksLocal/);
  assert.match(smokeSource, /00_TONG_HOP_SAN_XUAT_08-2026\.xlsx/);
  assert.match(smokeSource, /ĐỐI CHIẾU DỮ LIỆU/);
  assert.match(smokeSource, /workbook\.xlsx\.readFile/);
  assert.match(smokeSource, /tidb\.production_reports\.approved/);
});
