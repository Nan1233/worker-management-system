const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('runtime Excel exports only use backend/templates workbooks', () => {
  const files = [
    'services/companyExcelExportService.js',
    'services/companyMaiDoExcelService.js',
    'services/consolidatedExcelExportService.js'
  ];

  for (const relative of files) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /path\.join\([^\n]+templates/i, relative);
    assert.doesNotMatch(source, /KTC_dac_ta_form|file mẫu\(2\)\.xlsx|file mau\(2\)\.xlsx/i, relative);
  }
});

test('worker form headings are hard-coded in frontend source', () => {
  const source = fs.readFileSync(
    path.join(root, '..', 'frontend', 'src', 'pages', 'worker', 'processFormSchemas.ts'),
    'utf8'
  );
  for (const heading of ['Gia công - Cắt/Lồng', 'Mài', 'Đo', 'Kiểm 1', 'Kiểm 2', 'Cán', 'Ép', 'Xử lý bavia', 'Sản xuất 3']) {
    assert.match(source, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  assert.doesNotMatch(source, /xlsx|exceljs|readFile/i);
});
