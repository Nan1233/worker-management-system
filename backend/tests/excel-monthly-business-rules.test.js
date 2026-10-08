const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const monthly = fs.readFileSync(path.join(__dirname, '../../desktop/electron/monthlyWorkbookLocal.cjs'), 'utf8');
const legacyDesktop = fs.readFileSync(path.join(__dirname, '../../desktop/electron/companyExcelLocal.cjs'), 'utf8');
const legacyBackend = fs.readFileSync(path.join(__dirname, '../services/companyExcelExportService.js'), 'utf8');
const smoke = fs.readFileSync(path.join(__dirname, '../../desktop/scripts/smokeExcel.cjs'), 'utf8');
const engine = fs.readFileSync(path.join(__dirname, '../domain/productionCalculationEngine.cjs'), 'utf8');

test('monthly workbook preserves zero training and uses canonical calculation engine', () => {
  assert.match(monthly, /calculateProductionMetrics/);
  assert.match(monthly, /report\.calculationSnapshot\s*\|\|\s*calculateProductionMetrics/);
  assert.match(engine, /Math\.min\(100, Math\.max\(0, number\)\)/);
  assert.match(engine, /countedNg/);
  assert.match(engine, /ok \+ ng\.allNg/);
});

test('monthly workbook separates report and entry dates and sorts consistently', () => {
  assert.match(monthly, /date: asDate\(report\.work_date\)/);
  assert.match(monthly, /entryDate: asDateTime\(report\.created_at\)/);
  assert.match(monthly, /reportTimeKey\(a\)\.localeCompare\(reportTimeKey\(b\)\)/);
  assert.match(monthly, /machineDisplay\(a\)\.localeCompare/);
});

test('daily sequence, freeze and clear time labels are enforced', () => {
  assert.match(monthly, /let sequenceInDate = 0/);
  assert.match(monthly, /values\.stt = sequenceInDate/);
  assert.match(monthly, /xSplit: 4/);
  assert.match(monthly, /topLeftCell: 'E6'/);
  assert.match(monthly, /Tổng thời gian/);
  assert.match(monthly, /Thời gian thực tế/);
  assert.match(monthly, /Tổng thời gian trừ/);
});

test('legacy exporters use the same safety rules even though monthly clean renderer is canonical', () => {
  for (const source of [legacyDesktop, legacyBackend]) {
    assert.doesNotMatch(source, /rawTraining > 0 \? rawTraining : 1/);
    assert.match(source, /allNg\)|totalNg/);
  }
  assert.match(legacyDesktop, /sequenceInDate/);
});

test('real workbook smoke fixture covers zero training, KQD, ordering and date separation', () => {
  assert.match(smoke, /reports: \[report\(\{ id: 1, worker_code: '599' \}\), report\(\{ id: 2, worker_code: '600', work_date: '2026-08-02', actual_output: 0, training_percent: 0 \}\)\]/);
  assert.match(smoke, /defect_type_code: 'DEF_KQD_DB'/);
  assert.match(smoke, /work_date: '2026-08-01'/);
  assert.match(smoke, /created_at: '2026-08-02T08:00:00\.000Z'/);
  assert.match(smoke, /assert\.equal\(sheet\.getColumn\(2\)\.hidden, true/);
  assert.match(smoke, /assert\.equal\(String\(sheet\.getRow\(built\.headerRow\)\.getCell\(2\)\.value\), 'Thời gian nộp báo cáo'\)/);
  assert.match(smoke, /assert\.ok\(values\.includes\('STT'\)/);
  assert.match(smoke, /assert\.ok\(dateRow, 'Date row phải lấy work_date'\)/);
  assert.match(smoke, /assert\.equal\(submission\.getUTCHours\(\), 8\)/);
  assert.match(smoke, /DB detail alias mapping/);
});
