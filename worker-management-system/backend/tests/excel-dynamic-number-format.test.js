'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../desktop/electron/monthlyWorkbookLocal.cjs'),
  'utf8'
);

test('whole time and rate values use integer format to avoid trailing dot in Excel 2016', () => {
  assert.match(source, /function isWholeNumber\(value\)/);
  assert.match(source, /Math\.abs\(value - Math\.round\(value\)\) < 1e-9/);
  assert.match(source, /function resolvedNumberFormat\(value, requestedFormat\)/);
  assert.match(source, /requestedFormat === NUMBER_FORMATS\.DECIMAL/);
  assert.match(source, /requestedFormat === NUMBER_FORMATS\.RATE/);
  assert.match(source, /isWholeNumber\(value\) \? NUMBER_FORMATS\.INTEGER : requestedFormat/);
});

test('process rows and totals resolve number format from the actual value', () => {
  const matches = source.match(/cell\.numFmt = resolvedNumberFormat\(value, column\.format\)/g) || [];
  assert.ok(matches.length >= 2, 'data rows and total rows must both resolve formats dynamically');
  assert.match(source, /resolvedNumberFormat\(value, NUMBER_FORMATS\.DECIMAL\)/);
  assert.match(source, /resolvedNumberFormat\(value\.standard, NUMBER_FORMATS\.RATE\)/);
});
