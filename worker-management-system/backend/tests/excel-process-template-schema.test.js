const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../desktop/electron/monthlyWorkbookLocal.cjs'), 'utf8');

test('monthly workbook keeps process-specific detail columns from file-mau.xlsx', () => {
  assert.match(source, /PROCESS_TEMPLATE_SCHEMAS/);
  assert.match(source, /GC:\s*\{/);
  assert.match(source, /MAI:\s*\{/);
  assert.match(source, /DO:\s*\{/);
  assert.match(source, /K1:\s*\{/);
  assert.match(source, /K2:\s*\{/);
  assert.match(source, /CAN:\s*\{/);
  assert.match(source, /EP:\s*\{/);
  assert.match(source, /XLBV:\s*\{/);
  assert.match(source, /SX3:\s*\{/);
  assert.match(source, /Vệ sinh máy cán/);
  assert.match(source, /CAN HC/);
  assert.match(source, /Chân không','Rách vỡ','Bề mặt','Bavia/);
  assert.match(source, /Vệ sinh khuôn','Thay khuôn','5S \+ giao ca','Hâm khuôn','Sửa khuôn','Sửa máy/);
  assert.match(source, /CHÂN KHÔNG','RÁCH VỠ','XLBV','BẨN KHUÔN/);
  assert.match(source, /Kẹt Bushing/);
  assert.match(source, /Thiếu Slitring 1/);
});

test('template columns are merged with DB master and actual report details', () => {
  assert.match(source, /templateLabels = PROCESS_TEMPLATE_SCHEMAS\[processCode\]/);
  assert.match(source, /for \(const item of processData\?\.\[masterKey\] \|\| \[\]\) append\(item\)/);
  assert.match(source, /for \(const report of processData\?\.reports \|\| \[\]\)/);
});
