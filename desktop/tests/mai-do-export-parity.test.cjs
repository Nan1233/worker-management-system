const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'electron', 'companyExcelLocal.cjs'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8');

test('Mài export maps Giây mài to template column F', () => {
  assert.match(source, /grindingSeconds: 6/);
  assert.match(source, /setCell\(row, fixed\.grindingSeconds, reportGrindingSeconds\(report\), '0\.00'\)/);
});

test('Đo export maps related Mài machine to template column F from extra_data', () => {
  assert.match(source, /relatedGrindingMachine: 6/);
  assert.match(source, /setCell\(row, fixed\.relatedGrindingMachine, reportExtraValue\(report, 'grinding_machine_no'\)\)/);
});

test('Mài and Đo export separate workbooks using their matching source sheet', () => {
  assert.match(source, /MAI:[\s\S]*processCodes: \['MAI'\], template: 'bao-cao-mai-do-export\.xlsx'/);
  assert.match(source, /DO:[\s\S]*processCodes: \['DO'\], template: 'bao-cao-mai-do-export\.xlsx'/);
  assert.match(source, /sheetName: 'TT Mài', layout: 'MAI'/);
  assert.match(source, /sheetName: 'TT Đo', layout: 'DO'/);
  assert.match(source, /05_MAI_/);
  assert.match(source, /06_DO_/);
  assert.match(source, /targetSheetNames/);
  assert.match(source, /async function buildProcessExcelLocal/);
});
