const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const monthly = fs.readFileSync(path.join(__dirname, '../../desktop/electron/monthlyWorkbookLocal.cjs'), 'utf8');
const legacyDesktop = fs.readFileSync(path.join(__dirname, '../../desktop/electron/companyExcelLocal.cjs'), 'utf8');
const legacyBackend = fs.readFileSync(path.join(__dirname, '../services/companyExcelExportService.js'), 'utf8');
const smoke = fs.readFileSync(path.join(__dirname, '../../desktop/scripts/smokeExcel.cjs'), 'utf8');

test('monthly workbook preserves zero training and uses counted NG only for output', () => {
  assert.match(monthly, /Math\.min\(1, Math\.max\(0, normalized\)\)/);
  assert.match(monthly, /countedNgValue/);
  assert.match(monthly, /ng \/ ngDenominator/);
  assert.match(monthly, /ok \+ ng/);
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

test('real workbook smoke test covers shift C, zero training, KQD, ordering and date separation', () => {
  assert.match(smoke, /shift: 'C'/);
  assert.match(smoke, /training_percent: 0/);
  assert.match(smoke, /defect_type_code: 'KQD'/);
  assert.match(smoke, /STT phải reset theo ngày/);
  assert.match(smoke, /Ô A của hàng phân cách phải là ngày báo cáo trên form/);
  assert.match(smoke, /Thời gian nhập phải lấy từ created_at/);
});
