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

test('MAI: restore actual hours and SL/H + achievement for MACHINE-mode rows with zero approved time', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Mài');
  sheet.getCell('L1').value = 'Tổng TG trừ giờ';
  sheet.getCell('C1').value = 'Mã số';
  // Real uploaded case: Bùi Văn Phúc 11/11, J=6.6667, L=1, 709 output, 120 SP/h.
  sheet.getCell('A3').value = 1;
  sheet.getCell('C3').value = '4174';
  sheet.getCell('J3').value = 6.6667;
  sheet.getCell('K3').value = 0;
  sheet.getCell('L3').value = 1;
  sheet.getCell('AH3').value = 120;
  sheet.getCell('AI3').value = 709;
  // Real 15/11 machine 1 case: J=12; L=0.5833; output 2054; standard 180/h.
  sheet.getCell('A4').value = 2;
  sheet.getCell('C4').value = '3888';
  sheet.getCell('J4').value = 12;
  sheet.getCell('K4').value = 0;
  sheet.getCell('L4').value = 0.5833;
  sheet.getCell('AH4').value = 180;
  sheet.getCell('AI4').value = 2054;
  // Invalid effective hours: no SL/H or percentage may be fabricated.
  sheet.getCell('A5').value = 3;
  sheet.getCell('C5').value = '4381';
  sheet.getCell('J5').value = 5;
  sheet.getCell('K5').value = 0;
  sheet.getCell('L5').value = 7;
  sheet.getCell('AH5').value = 85;
  sheet.getCell('AI5').value = 350;
  const result = await reconcileMaiWorkbookDeductions(Buffer.from(await book.xlsx.writeBuffer()));
  const output = new ExcelJS.Workbook();
  await output.xlsx.load(result.buffer);
  const corrected = output.getWorksheet('Mài');
  for (const [row, total, deduction, standard, quantity] of [
    [3, 6.6667, 1, 120, 709],
    [4, 12, 0.5833, 180, 2054]
  ]) {
    const hours = total - deduction;
    const slh = quantity / hours;
    assert.ok(Math.abs(corrected.getCell('K' + row).value - hours) < 1e-9);
    assert.ok(Math.abs(corrected.getCell('AL' + row).value - slh) < 1e-8);
    assert.ok(Math.abs(corrected.getCell('AJ' + row).value - slh / standard) < 1e-8);
  }
  assert.equal(corrected.getCell('K5').value, 0);
  assert.equal(corrected.getCell('AL5').value, null);
  assert.equal(corrected.getCell('AJ5').value, null);
  const second = await reconcileMaiWorkbookDeductions(result.buffer);
  assert.equal(second.changed, 0, 'reconciliation is idempotent');
});

test('MAI: standard already represents pieces/hour and must not be multiplied by hours', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Mài');
  sheet.getCell('L1').value = 'Tổng TG trừ giờ';
  sheet.getCell('C1').value = 'Mã số';
  sheet.getCell('A3').value = 1;
  sheet.getCell('C3').value = '3922';
  sheet.getCell('J3').value = 4;
  sheet.getCell('K3').value = 4;
  sheet.getCell('L3').value = 0;
  sheet.getCell('AH3').value = 180;
  sheet.getCell('AI3').value = 720;
  const result = await reconcileMaiWorkbookDeductions(Buffer.from(await book.xlsx.writeBuffer()));
  const output = new ExcelJS.Workbook();
  await output.xlsx.load(result.buffer);
  assert.equal(output.getWorksheet('Mài').getCell('AL3').value, 180);
  assert.equal(output.getWorksheet('Mài').getCell('AJ3').value, 1);
});

test('MAI MACHINE: numeric zero SL/H and achievement are repaired, not treated as valid cached figures', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Mài');
  sheet.getCell('L1').value = 'Tổng TG trừ giờ';
  sheet.getCell('C1').value = 'Mã số';
  sheet.getCell('A3').value = 1;
  sheet.getCell('C3').value = '4174';
  sheet.getCell('J3').value = 6.6667;
  sheet.getCell('K3').value = 0;
  sheet.getCell('L3').value = 1;
  sheet.getCell('AH3').value = 120;
  sheet.getCell('AI3').value = 709;
  sheet.getCell('AL3').value = 0;
  sheet.getCell('AJ3').value = 0;
  const result = await reconcileMaiWorkbookDeductions(Buffer.from(await workbook.xlsx.writeBuffer()));
  const fixed = new ExcelJS.Workbook();
  await fixed.xlsx.load(result.buffer);
  const row = fixed.getWorksheet('Mài').getRow(3);
  assert.ok(Math.abs(row.getCell(11).value - 5.6667) < 1e-9);
  assert.ok(Math.abs(row.getCell(38).value - 709 / 5.6667) < 1e-9);
  assert.ok(Math.abs(row.getCell(36).value - (709 / 5.6667) / 120) < 1e-9);
  assert.equal((await reconcileMaiWorkbookDeductions(result.buffer)).changed, 0);
});

test('MAI: re-computes stale nonzero SL/H and percent using K and hourly standard', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Mài');
  sheet.getCell('L1').value = 'Tổng TG trừ giờ';
  sheet.getCell('C1').value = 'Mã số';
  sheet.getCell('A3').value = 1;
  sheet.getCell('C3').value = '4381';
  sheet.getCell('J3').value = 5;
  sheet.getCell('K3').value = 5;
  sheet.getCell('L3').value = 7; // source inconsistency: never subtract again from K
  sheet.getCell('AH3').value = 85;
  sheet.getCell('AI3').value = 350;
  sheet.getCell('AL3').value = 999;
  sheet.getCell('AJ3').value = 3;
  const fixed = await reconcileMaiWorkbookDeductions(Buffer.from(await book.xlsx.writeBuffer()));
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(fixed.buffer);
  const row = out.getWorksheet('Mài').getRow(3);
  assert.equal(row.getCell(11).value, 5, 'must preserve an existing positive actual hour snapshot');
  assert.equal(row.getCell(38).value, 70);
  assert.ok(Math.abs(row.getCell(36).value - 70/85) < 1e-10);
  assert.equal((await reconcileMaiWorkbookDeductions(fixed.buffer)).changed, 0);
});
