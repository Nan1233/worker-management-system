const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'companyExcelLocal.cjs'), 'utf8');

test('Mài export maps Giây mài to template column F', () => {
  assert.match(source, /grindingSeconds: 6/);
  assert.match(source, /setCell\(row, fixed\.grindingSeconds, reportGrindingSeconds\(report\), '0\.00'\)/);
});

test('Đo export maps related Mài machine to template column F from extra_data', () => {
  assert.match(source, /relatedGrindingMachine: 6/);
  assert.match(source, /setCell\(row, fixed\.relatedGrindingMachine, reportExtraValue\(report, 'grinding_machine_no'\)\)/);
});

test('Mài–Đo keeps one local workbook with both template sheets and uses the same local build entry point as Gia công', () => {
  assert.match(source, /MAI_DO:[\\s\\S]*template: 'file-mau\\.xlsx'/);
  assert.match(source, /sheetName: 'TT Mài', layout: 'MAI'/);
  assert.match(source, /sheetName: 'TT Đo', layout: 'DO'/);
  assert.match(source, /async function buildProcessExcelLocal/);
});
