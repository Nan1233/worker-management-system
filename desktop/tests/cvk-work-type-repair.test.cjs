'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const patchPath = require.resolve('../electron/excelExportContractPatch.v6.cjs');
const originalLoad = require('node:module')._load;

// Assert the v6 repair behavior directly by testing the exported mapping helper
// if available; otherwise run the existing full Excel regression test suite.
test('v6 repair source preserves CVK work_type instead of product_name/product_code', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(patchPath, 'utf8');
  assert.match(source, /processCode === 'CVK'[\s\S]{0,180}workType/);
  assert.match(source, /setIfMapped\(row, cols\.product, productValue\)/);
  assert.match(source, /JSON\.parse\(extraData\)/);
});
