'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { reconcileMaiWorkbookDeductions } = require('../electron/excelExportContractPatch.v6.cjs');

async function sample() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Mài');
  sheet.getCell('L1').value = 'Tổng TG trừ giờ';
  sheet.getCell('C1').value = 'Mã số';
  sheet.getCell('A2').value = '06/11/2026';
  sheet.getCell('A3').value = 1;
  sheet.getCell('C3').value = '4333';
  sheet.getCell('J3').value = 10.6667;
  sheet.getCell('K3').value = 10.6667;
  sheet.getCell('L3').value = 0;
  sheet.getCell('W3').value = 7/6;
  sheet.getCell('Z3').value = 1/6;
  sheet.getCell('A4').value = '08/11/2026';
  sheet.getCell('A5').value = 1;
  sheet.getCell('C5').value = '3888';
  sheet.getCell('L5').value = 0;
  sheet.getCell('P5').value = 1/3;
  sheet.getCell('W5').value = 7/6;
  sheet.getCell('Z5').value = 0.15;
  sheet.getCell('A6').value = 2;
  sheet.getCell('C6').value = '3922';
  sheet.getCell('L6').value = 2;
  sheet.getCell('W6').value = 1;
  book.addWorksheet('_KTC_SYNC', { state: 'veryHidden' });
  return book.xlsx.writeBuffer();
}

test('MAI final workbook output fixes 0 totals using actual visible deduction columns', async () => {
  const { buffer, changed } = await reconcileMaiWorkbookDeductions(Buffer.from(await sample()));
  assert.equal(changed, 2);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  const sheet = book.getWorksheet('Mài');
  assert.ok(Math.abs(sheet.getCell('L3').value - 4/3) < 1e-9);
  assert.ok(Math.abs(sheet.getCell('L5').value - 1.65) < 1e-9);
  assert.equal(sheet.getCell('L6').value, 2, 'preserve nonzero approved total');
  assert.equal(sheet.getCell('J3').value, 10.6667, 'work time must not be rewritten');
  assert.equal(sheet.getCell('K3').value, 10.6667, 'approved actual time must not be rewritten');
  assert.equal(sheet.getCell('A2').value, '06/11/2026', 'separator remains unchanged');
  assert.equal(book.getWorksheet('_KTC_SYNC').state, 'veryHidden', 'metadata sheet survives');
});

test('MAI final reconciliation is idempotent', async () => {
  const first = await reconcileMaiWorkbookDeductions(Buffer.from(await sample()));
  const second = await reconcileMaiWorkbookDeductions(first.buffer);
  assert.equal(second.changed, 0);
});

test('MAI final reconciliation fails closed on unexpected workbook column layout', async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('Mài').getCell('L1').value = 'Unrelated field';
  await assert.rejects(reconcileMaiWorkbookDeductions(Buffer.from(await book.xlsx.writeBuffer())), /column contract/);
});
