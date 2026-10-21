const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('a row stored as Lồng is never relabelled Cắt just because its code has a C alias', () => {
  const source = fs.readFileSync(path.join(__dirname, '../controllers/productStandardController.js'), 'utf8');
  const caseBlock = source.slice(source.indexOf('CASE'), source.indexOf('END AS work_type'));
  const longIdx = caseBlock.indexOf("IN ('LỒNG','LONG') THEN 'LONG'");
  const aliasIdx = caseBlock.indexOf("LIKE 'C%' THEN 'CUT'");
  assert.ok(longIdx > -1 && aliasIdx > -1, 'both CASE branches exist');
  assert.ok(longIdx < aliasIdx, 'stored Lồng must be evaluated before the C-alias => Cắt rule');
  assert.ok(caseBlock.indexOf("'XUATNHAP'") < aliasIdx, 'zero-standard Lồng work codes still resolve first');
});
