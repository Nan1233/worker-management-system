'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../desktop/electron/monthlyWorkbookLocal.cjs'),
  'utf8'
);

test('monthly workbook hides unnecessary trailing decimal zeros', () => {
  assert.match(source, /INTEGER:\s*'#,##0;-#,##0;0'/);
  assert.match(source, /DECIMAL:\s*'#,##0\.##;-#,##0\.##;0'/);
  assert.match(source, /RATE:\s*'#,##0\.##;-#,##0\.##;0'/);
  assert.match(source, /PERCENT:\s*'0\.##%;-0\.##%;0%'/);
});

test('quantity columns remain integers while time, rate and percentage keep optional decimals', () => {
  assert.match(source, /key:\s*'ok'.*format:\s*NUMBER_FORMATS\.INTEGER/);
  assert.match(source, /key:\s*'ng'.*format:\s*NUMBER_FORMATS\.INTEGER/);
  assert.match(source, /key:\s*'enteredOutput'.*format:\s*NUMBER_FORMATS\.INTEGER/);
  assert.match(source, /key:\s*'output'.*format:\s*NUMBER_FORMATS\.INTEGER/);
  assert.match(source, /group:\s*'defect'.*format:\s*NUMBER_FORMATS\.INTEGER/s);
  assert.match(source, /key:\s*'workingTime'.*format:\s*NUMBER_FORMATS\.DECIMAL/);
  assert.match(source, /group:\s*'deduction'.*format:\s*NUMBER_FORMATS\.DECIMAL/s);
  assert.match(source, /key:\s*'outputPerHour'.*format:\s*NUMBER_FORMATS\.RATE/);
  assert.match(source, /key:\s*'achievement'.*format:\s*NUMBER_FORMATS\.PERCENT/);
  assert.match(source, /key:\s*'ngRate'.*format:\s*NUMBER_FORMATS\.PERCENT/);
});
