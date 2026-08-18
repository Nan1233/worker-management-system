'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PROCESS_TEMPLATE_CONTRACTS,
  normalizeLabel,
  resolveTemplatePath
} = require('../services/excelTemplateContractService');

test('KTC template contract covers all 9 production processes', () => {
  assert.deepEqual(Object.keys(PROCESS_TEMPLATE_CONTRACTS).sort(), ['CAN','DO','EP','GC','K1','K2','MAI','SX3','XLBV']);
  for (const contract of Object.values(PROCESS_TEMPLATE_CONTRACTS)) {
    assert.ok(contract.sheet);
    assert.ok(contract.headerRow > 0);
    assert.ok(contract.dataStartRow >= contract.headerRow + 1);
  }
});

test('template path resolves to canonical KTC workbook', async () => {
  const file = await resolveTemplatePath();
  assert.equal(path.basename(file), 'KTC-Bao-cao-9-cong-doan.xlsx');
  assert.ok(fs.statSync(file).size > 100_000);
});

test('template label normalization handles Vietnamese multiline headers', () => {
  assert.equal(normalizeLabel('Nhập\n mã số CN'), 'nhap ma so cn');
  assert.equal(normalizeLabel('% học việc'), 'hoc viec');
  assert.equal(normalizeLabel('Mã SP'), 'ma sp');
});
