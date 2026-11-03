const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('a row stored as Lồng is never relabelled Cắt just because its code has a C alias', () => {
  const source = fs.readFileSync(path.join(__dirname, '../controllers/productStandardController.js'), 'utf8');
  const caseBlock = source.slice(source.indexOf('CASE'), source.indexOf('END AS work_type'));
  const noStandardIdx = caseBlock.indexOf("IN ('XUATNHAP','KTCD','TAIPP') THEN 'LONG'");
  const longIdx = caseBlock.indexOf("IN ('LỒNG','LONG','LONG TAY') THEN 'LONG'");
  const cutIdx = caseBlock.indexOf("IN ('CẮT','CUT','CAT') THEN 'CUT'");
  assert.ok(noStandardIdx > -1 && longIdx > -1 && cutIdx > -1, 'explicit no-standard, Lồng, and Cắt branches exist');
  assert.ok(noStandardIdx < longIdx && longIdx < cutIdx, 'stored work_type is resolved explicitly; Lồng is not inferred as Cắt from a C alias');
});
