const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/managerReportDateLogic.ts'), 'utf8');

test('custom manager report range rejects impossible calendar days', () => {
  assert.match(source, /const isValidDate = \(value: string\): boolean/);
  assert.match(source, /new Date\(year, month, 0\)\.getDate\(\)/);
  assert.match(source, /month < 1 \|\| month > 12/);
  assert.match(source, /isValidDate\(dateFrom\)/);
  assert.match(source, /isValidDate\(dateTo\)/);
});
test('custom manager report range normalizes reversed boundaries', () => {
  assert.match(source, /return start <= end/);
  assert.match(source, /\{ dateFrom: start, dateTo: end \}/);
  assert.match(source, /\{ dateFrom: end, dateTo: start \}/);
});
