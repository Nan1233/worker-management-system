'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const {
  PROCESS_TEMPLATE_CONTRACTS,
  resolveTemplatePath,
  normalizeLabel
} = require('../services/excelTemplateContractService');

test('canonical KTC template exists and contains all 9 production sheets', async () => {
  const file = await resolveTemplatePath();
  assert.ok(fs.statSync(file).size > 100_000);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  for (const contract of Object.values(PROCESS_TEMPLATE_CONTRACTS)) {
    assert.ok(workbook.getWorksheet(contract.sheet), `missing sheet ${contract.sheet}`);
    assert.ok(contract.dataEndRow >= contract.dataStartRow);
  }
});

test('template label normalization is stable for Vietnamese multiline headers', () => {
  assert.equal(normalizeLabel('Nhập\\n mã số CN'), 'nhap ma so cn');
  assert.equal(normalizeLabel('% học việc'), 'hoc viec');
  assert.equal(normalizeLabel('Mã số Sản Phẩm'), 'ma so san pham');
});
