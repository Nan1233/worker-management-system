const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../desktop/electron/monthlyWorkbookLocal.cjs'), 'utf8');
const schemaSource = fs.readFileSync(path.join(__dirname, '../../desktop/electron/monthlyWorkbookSchemas.cjs'), 'utf8');

test('monthly workbook keeps process-specific detail columns from file-mau.xlsx', () => {
  assert.match(schemaSource, /PROCESS_TEMPLATE_SCHEMAS/);
  assert.match(schemaSource, /GC:\s*\{/);
  assert.match(schemaSource, /MAI:\s*\{/);
  assert.match(schemaSource, /DO:\s*\{/);
  assert.match(schemaSource, /K1:\s*\{/);
  assert.match(schemaSource, /K2:\s*\{/);
  assert.match(schemaSource, /CAN:\s*\{/);
  assert.match(schemaSource, /EP:\s*\{/);
  assert.match(schemaSource, /XLBV:\s*\{/);
  assert.match(schemaSource, /SX3:\s*\{/);
  assert.match(schemaSource, /Vệ sinh máy cán/);
  assert.match(schemaSource, /CAN HC/);
  assert.match(schemaSource, /Chân không','Rách vỡ','Bề mặt','Bavia/);
  assert.match(schemaSource, /Vệ sinh khuôn','Thay khuôn','5S \+ giao ca','Hâm khuôn','Sửa khuôn','Sửa máy/);
  assert.match(schemaSource, /CHÂN KHÔNG','RÁCH VỠ','XLBV','BẨN KHUÔN/);
  assert.match(schemaSource, /Kẹt Bushing/);
  assert.match(schemaSource, /Thiếu Slitring 1/);
});

test('template columns are merged with DB master and actual report details', () => {
  assert.match(source, /templateLabels = PROCESS_TEMPLATE_SCHEMAS\[processCode\]/);
  assert.match(source, /for \(const item of processData\?\.\[masterKey\] \|\| \[\]\) append\(item\)/);
  assert.match(source, /for \(const report of processData\?\.reports \|\| \[\]\)/);
});
