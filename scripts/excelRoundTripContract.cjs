#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const templatePath = path.join(root, 'backend', 'templates', 'KTC-Bao-cao-9-cong-doan.xlsx');

function requireExcelJS() {
  try {
    return require('exceljs');
  } catch (error) {
    console.error('[KTC] Excel round-trip contract skipped: exceljs is not installed.');
    console.error('[KTC] Run `npm install --prefix backend` before executing this runtime contract.');
    process.exitCode = 2;
    return null;
  }
}

(async () => {
  assert.ok(fs.existsSync(templatePath), `Missing canonical Excel template: ${templatePath}`);
  const ExcelJS = requireExcelJS();
  if (!ExcelJS) return;

  const source = new ExcelJS.Workbook();
  await source.xlsx.readFile(templatePath);

  const expectedProcessSheets = [
    'CÁN', 'EP', 'XLBV', 'Cắt lồng', 'TT Mài',
    'TT Đo', 'TT Kiểm 1', 'TT Kiểm 2', 'sx3'
  ];
  const names = source.worksheets.map((sheet) => sheet.name);
  for (const name of expectedProcessSheets) {
    assert.ok(names.includes(name), `Canonical workbook missing process sheet: ${name}`);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktc-excel-roundtrip-'));
  const roundTripPath = path.join(tempDir, 'roundtrip.xlsx');

  try {
    // Round-trip through the same XLSX serialization path used by production.
    await source.xlsx.writeFile(roundTripPath);
    assert.ok(fs.statSync(roundTripPath).size > 100_000, 'Round-trip workbook is unexpectedly small');

    const restored = new ExcelJS.Workbook();
    await restored.xlsx.readFile(roundTripPath);
    assert.deepEqual(
      restored.worksheets.map((sheet) => sheet.name),
      names,
      'Round-trip changed workbook sheet names/order'
    );

    for (const name of expectedProcessSheets) {
      const original = source.getWorksheet(name);
      const copy = restored.getWorksheet(name);
      assert.ok(copy, `Round-trip lost sheet ${name}`);
      assert.equal(copy.rowCount, original.rowCount, `Row count changed for ${name}`);
      assert.equal(copy.columnCount, original.columnCount, `Column count changed for ${name}`);
    }

    // Guard against accidentally introducing a macro-enabled artifact.
    assert.equal(path.extname(roundTripPath), '.xlsx');
    console.log(`[KTC] Excel round-trip contract PASS (${expectedProcessSheets.length} process sheets; ${names.length} total sheets)`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error('[KTC] Excel round-trip contract FAIL:', error.message);
  process.exitCode = 1;
});
