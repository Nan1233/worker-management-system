'use strict';

// GC "Báo cáo công nhân" export against backend/templates/04_CAT_LONG_template.xlsx.
// Every workbook produced here is also written to test-results/e2e-results/excel/.

const test = require('node:test');
const assert = require('node:assert/strict');
const x = require('../lib/xlsx-helpers.cjs');
const { writeArtifact } = require('../lib/reporter.cjs');
const fx = require('./fixtures.cjs');

const options = { deductionTypes: fx.deductionTypes, defectTypes: fx.defectTypes };
const H_W = x.range('H', 'W');
const AD_AV = x.range('AD', 'AV');
const sumCells = (sheet, row, columns) => columns.reduce((s, c) => s + Number(sheet.getRow(row).getCell(c).value || 0), 0);
const columnOf = (sheet, label) => {
  const headers = x.headerMap(sheet);
  for (const [column, text] of headers) if (text === label) return column;
  throw new Error(`header ${label} not found`);
};

// Current DB defect -> template column resolution (excelColumnContracts.js aliases
// + exact header match). Anything else must stay unmapped.
const EXPECTED_DEFECT_COLUMN = {
  CUT_1: 'AH', CUT_2: 'AO', CUT_6: 'AI', CUT_8: 'AN',
  LONG_2: 'AE', LONG_3: 'AF', LONG_4: 'AF', LONG_5: 'AV', XOAY: 'AG'
};
const EXPECTED_UNMAPPED = ['CUT_3', 'CUT_4', 'CUT_5', 'CUT_7', 'CUT_9', 'CUT_10', 'LONG_1', 'LONG_6', 'LONG_7', 'LONG_8'];

test('2 machine lines -> exactly 2 Excel rows under one date row', async () => {
  const { sheet, result, workbook } = await x.renderGc([fx.twoMachineReport()], options);
  await x.saveAndReload(workbook, 'excel', 'gc-04-two-machines.xlsx');
  assert.equal(result.rowCount, 2);
  assert.equal(result.dayCount, 1);
  assert.ok(sheet.getCell('A4').value instanceof Date, 'row 4 is the date row');
  assert.equal(sheet.getCell('A5').value, 1);
  assert.equal(sheet.getCell('A6').value, 2);
  assert.equal(sheet.getRow(7).actualCellCount, 0, 'no third data row');
  assert.equal(sheet.getCell('D5').value, '5');
  assert.equal(sheet.getCell('D6').value, '6');
});

test('F/G: worked hours and deduction total come from each line', async () => {
  const { sheet } = await x.renderGc([fx.twoMachineReport()], options);
  // Machine 5: 4.5 h - 0.5 h ; Machine 6: 6 h - 1 h
  assert.equal(sheet.getCell('F5').value, 4);
  assert.equal(sheet.getCell('G5').value, 0.5);
  assert.equal(sheet.getCell('F6').value, 5);
  assert.equal(sheet.getCell('G6').value, 1);
});

test('H:W: each line carries only its own deductions and sums to G', async () => {
  const { sheet } = await x.renderGc([fx.twoMachineReport()], options);
  const nghi = columnOf(sheet, 'Nghỉ giải lao');
  const cho = columnOf(sheet, 'Chờ hàng');
  const s5 = columnOf(sheet, '5s');
  const matDien = columnOf(sheet, 'Mất điện');
  assert.deepEqual(x.filledCells(sheet, 5, H_W), { [x.columnLetter(nghi)]: 0.5 });
  assert.deepEqual(x.filledCells(sheet, 6, H_W), { [x.columnLetter(cho)]: 0.75, [x.columnLetter(s5)]: 0.25 });
  assert.equal(sheet.getRow(5).getCell(matDien).value, null, 'report-level deduction is not copied onto machine rows');
  assert.equal(sumCells(sheet, 5, H_W), sheet.getCell('G5').value);
  assert.equal(sumCells(sheet, 6, H_W), sheet.getCell('G6').value);
});

test('X/Y/Z/AA/AB/AC per line; AA is =IFERROR(Z/Y,0)', async () => {
  const { sheet } = await x.renderGc([fx.twoMachineReport()], options);
  assert.equal(sheet.getCell('X5').value, 'E2E-5770');
  assert.equal(sheet.getCell('X6').value, 'E2E-9116');
  assert.equal(sheet.getCell('Y5').value, 2400); // 600/h * 4 h
  assert.equal(sheet.getCell('Y6').value, 1500); // 300/h * 5 h
  assert.equal(sheet.getCell('AB5').value, 100);
  assert.equal(sheet.getCell('AC5').value, 5);
  assert.equal(sheet.getCell('Z5').value, 105);
  assert.equal(sheet.getCell('AB6').value, 240);
  assert.equal(sheet.getCell('AC6').value, 12);
  assert.equal(sheet.getCell('Z6').value, 252);
  for (const r of [5, 6]) {
    const aa = sheet.getCell(`AA${r}`).value;
    assert.equal(typeof aa, 'object');
    assert.equal(aa.formula, `IFERROR(Z${r}/Y${r},0)`);
  }
});

test('AD:AV: each line carries only its own defects and mapped defects sum to AC', async () => {
  const { sheet } = await x.renderGc([fx.twoMachineReport()], options);
  assert.deepEqual(x.filledCells(sheet, 5, AD_AV), { AH: 5 });
  assert.deepEqual(x.filledCells(sheet, 6, AD_AV), { AE: 7, AG: 5 });
  assert.equal(sumCells(sheet, 5, AD_AV), sheet.getCell('AC5').value);
  assert.equal(sumCells(sheet, 6, AD_AV), sheet.getCell('AC6').value);
  assert.equal(sheet.getRow(5).getCell(x.columnNumber('AO')).value, null, 'report-level defect (Cắt lẹm 777) is not copied');
});

test('AA formula survives save/reload and is never replaced by a value', async () => {
  const { workbook } = await x.renderGc([fx.twoMachineReport(), fx.manualReport()], options);
  const { workbook: again, file } = await x.saveAndReload(workbook, 'excel', 'gc-04-roundtrip.xlsx');
  const sheet = again.getWorksheet(x.GC_SHEET);
  for (const r of [5, 6, 7]) assert.equal(sheet.getCell(`AA${r}`).value?.formula, `IFERROR(Z${r}/Y${r},0)`, `AA${r} in ${file}`);
  // Input columns hold values, not formulas: only AA is a formula column.
  for (const r of [5, 6, 7]) {
    for (let c = 1; c <= 48; c += 1) {
      if (c === x.columnNumber('AA')) continue;
      const v = sheet.getRow(r).getCell(c).value;
      assert.ok(!(v && typeof v === 'object' && 'formula' in v), `${x.columnLetter(c)}${r} must not be a formula`);
    }
  }
});

test('16 deduction types each land in their own header column H..W', async () => {
  assert.equal(fx.GC_DEDUCTION_NAMES.length, 16);
  const deductions = fx.GC_DEDUCTION_NAMES.map((name, i) => fx.ded(name, (i + 1) / 100));
  const report = fx.twoMachineReport({
    machineLines: [{ ...fx.twoMachineReport().machineLines[0], machine_time_hours: 10, deductions_json: JSON.stringify(deductions), deduction_time_hours: 1.36 }]
  });
  const { sheet, result } = await x.renderGc([report], options);
  const headers = x.headerMap(sheet);
  fx.GC_DEDUCTION_NAMES.forEach((name, i) => {
    const column = H_W[i];
    assert.equal(headers.get(column), name, `template column ${x.columnLetter(column)} header`);
    assert.equal(sheet.getRow(5).getCell(column).value, (i + 1) / 100, `${name} -> ${x.columnLetter(column)}`);
  });
  assert.equal(result.unmapped.filter((u) => u.kind === 'deduction').length, 0);
  assert.equal(sheet.getCell('G5').value, 1.36);
});

test('19 template defect headers AD..AV each receive their own value', async () => {
  const { sheet: template } = await x.renderGc([], options);
  const labels = AD_AV.map((c) => x.headerMap(template).get(c));
  assert.equal(labels.length, 19);
  assert.equal(new Set(labels).size, 19, 'defect headers are distinct');
  const defects = labels.map((name, i) => ({ defect_name: name, quantity: i + 1 }));
  const line = { ...fx.twoMachineReport().machineLines[0], defects, ng_quantity: defects.reduce((s, d) => s + d.quantity, 0) };
  const { sheet, result } = await x.renderGc([fx.twoMachineReport({ machineLines: [line] })], options);
  AD_AV.forEach((column, i) => assert.equal(sheet.getRow(5).getCell(column).value, i + 1, `${labels[i]} -> ${x.columnLetter(column)}`));
  assert.deepEqual(result.unmapped, []);
});

test('19 DB defects: 9 mapped by header/alias, 10 UNMAPPED reported and not folded into "Khác" or any column', async () => {
  assert.equal(fx.GC_DB_DEFECTS.length, 19, 'migration 048 defines 19 GC defects');
  const defects = fx.GC_DB_DEFECTS.map((item, i) => fx.def(item.code, 10 + i));
  const ng = defects.reduce((s, d) => s + d.quantity, 0);
  const line = { ...fx.twoMachineReport().machineLines[0], defects, ng_quantity: ng };
  const { sheet, result, workbook } = await x.renderGc([fx.twoMachineReport({ machineLines: [line] })], options);
  await x.saveAndReload(workbook, 'excel', 'gc-04-19-db-defects.xlsx');

  const unmappedNames = result.unmapped.filter((u) => u.kind === 'defect').map((u) => u.name).sort();
  const expectedNames = EXPECTED_UNMAPPED.map((code) => fx.defectTypes.find((t) => t.defect_code === code).defect_name).sort();
  writeArtifact('excel', 'gc-04-unmapped-defects.json', result.unmapped);
  assert.equal(unmappedNames.length, 10);
  assert.deepEqual(unmappedNames, expectedNames);

  const headers = [...x.headerMap(sheet).values()].map((h) => h.toLowerCase());
  assert.ok(!headers.includes('khác'), 'template has no "Khác" column to absorb unmapped defects');

  const expected = {};
  for (const [code, letter] of Object.entries(EXPECTED_DEFECT_COLUMN)) {
    expected[letter] = (expected[letter] || 0) + defects.find((d) => d.defect_code === code).quantity;
  }
  assert.deepEqual(x.filledCells(sheet, 5, AD_AV), expected);
  const unmappedQty = defects.filter((d) => EXPECTED_UNMAPPED.includes(d.defect_code)).reduce((s, d) => s + d.quantity, 0);
  assert.equal(sumCells(sheet, 5, AD_AV), ng - unmappedQty, 'unmapped quantities are not placed in any defect column');
  assert.equal(sheet.getCell('AC5').value, ng, 'AC keeps the full NG including unmapped defects');
  assert.ok(result.warnings.every((w) => w.code !== 'DEFECT_TOTAL_DIFFERS_FROM_NG'));
});

test('date rows and STT reset per day', async () => {
  const day1 = fx.twoMachineReport();
  const day1Manual = fx.manualReport();
  const day2 = fx.twoMachineReport({ id: 9003, work_date: '2026-09-04', worker_code: '5000' });
  const { sheet, result, workbook } = await x.renderGc([day2, day1Manual, day1], options);
  await x.saveAndReload(workbook, 'excel', 'gc-04-two-days.xlsx');
  assert.equal(result.dayCount, 2);
  assert.equal(result.rowCount, 5);
  // 4 date(03) 5,6 machines 7 manual | 8 date(04) 9,10 machines
  const dateRows = [4, 8];
  for (const r of dateRows) {
    assert.ok(sheet.getCell(`A${r}`).value instanceof Date, `A${r} is a date row`);
    assert.equal(sheet.getCell(`A${r}`).numFmt, 'mmm-dd');
    assert.equal(sheet.getCell(`B${r}`).value, null);
  }
  assert.equal(sheet.getCell('A4').value.toISOString().slice(0, 10), '2026-09-03');
  assert.equal(sheet.getCell('A8').value.toISOString().slice(0, 10), '2026-09-04');
  assert.deepEqual([5, 6, 7].map((r) => sheet.getCell(`A${r}`).value), [1, 2, 3]);
  assert.deepEqual([9, 10].map((r) => sheet.getCell(`A${r}`).value), [1, 2], 'STT restarts at 1 on the next day');
  assert.equal(sheet.getCell('B9').value, '5000');
});

test('manual (làm tay) report -> one row from report-level data', async () => {
  const { sheet, result } = await x.renderGc([fx.manualReport()], options);
  assert.equal(result.rowCount, 1);
  assert.equal(sheet.getCell('A5').value, 1);
  assert.equal(sheet.getCell('B5').value, '947');
  assert.equal(sheet.getCell('D5').value, null, 'manual row has no machine');
  assert.equal(sheet.getCell('E5').value, 'C');
  assert.equal(sheet.getCell('F5').value, 7.25);
  assert.equal(sheet.getCell('G5').value, 0.75);
  assert.deepEqual(x.filledCells(sheet, 5, H_W), { [x.columnLetter(columnOf(sheet, 'Giao ca'))]: 0.5, [x.columnLetter(columnOf(sheet, '5s'))]: 0.25 });
  assert.equal(sheet.getCell('X5').value, 'E2E-TAY');
  assert.equal(sheet.getCell('Y5').value, 870); // 120/h * 7.25 h
  assert.equal(sheet.getCell('Z5').value, 809);
  assert.equal(sheet.getCell('AB5').value, 800);
  assert.equal(sheet.getCell('AC5').value, 9);
  assert.equal(sheet.getCell('AA5').value.formula, 'IFERROR(Z5/Y5,0)');
  assert.deepEqual(x.filledCells(sheet, 5, AD_AV), { AV: 4, AI: 5 });
});

test('line with a deduction total but no breakdown keeps G and raises a warning', async () => {
  const line = { ...fx.twoMachineReport().machineLines[0], deductions_json: '[]', deduction_time_hours: 0.5 };
  const { sheet, result } = await x.renderGc([fx.twoMachineReport({ machineLines: [line] })], options);
  assert.equal(sheet.getCell('G5').value, 0.5);
  assert.equal(sheet.getCell('F5').value, 4);
  assert.deepEqual(x.filledCells(sheet, 5, H_W), {});
  assert.ok(result.warnings.some((w) => w.code === 'DEDUCTION_WITHOUT_BREAKDOWN' && w.machine === '5'));
});
