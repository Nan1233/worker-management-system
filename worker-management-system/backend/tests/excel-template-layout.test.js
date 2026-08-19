const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('monthly Excel uses a clean stable renderer instead of modifying sample workbooks', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../desktop/electron/monthlyWorkbookLocal.cjs'), 'utf8');
  assert.match(source, /new ExcelJS\.Workbook\(\)/);
  assert.match(source, /renderProcessSheet\(/);
  assert.match(source, /addCover\(/);
  assert.match(source, /addSummary\(/);
  assert.doesNotMatch(source, /readFile\(|spliceRows|mergeCells.*template|Nguyễn Thị A|Trần Văn B/);
});
