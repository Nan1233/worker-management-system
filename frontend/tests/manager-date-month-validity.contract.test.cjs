const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/managerReportDateLogic.ts'), 'utf8');

test('monthly report range only accepts calendar months 01 through 12', () => {
  const match = source.match(/const month = \/(\^.*?\$)\/\.test\(selectedMonth\)/);
  assert.ok(match, 'monthly range must validate selectedMonth');
  const pattern = new RegExp(match[1]);
  assert.equal(pattern.test('2026-01'), true);
  assert.equal(pattern.test('2026-12'), true);
  for (const invalid of ['2026-00', '2026-13', '2026-99', '2026-1', '2026-11-01', 'abcd-10']) {
    assert.equal(pattern.test(invalid), false, invalid);
  }
  assert.match(source, /getToday\(\)\.slice\(0, 7\)/);
  assert.match(source, /new Date\(y, m, 0\)\.getDate\(\)/);
});
