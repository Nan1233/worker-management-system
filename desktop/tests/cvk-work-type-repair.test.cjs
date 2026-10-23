'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const patchPath = require.resolve('../electron/excelExportContractPatch.v6.cjs');
// Guard the regression-sensitive mapping behavior in the v6 repair pass.
test('v6 repair source preserves CVK work_type instead of product_name/product_code', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync(patchPath, 'utf8');
  assert.match(source, /processCode === 'CVK'[\s\S]{0,180}workType/);
  assert.match(source, /setIfMapped\(row, cols\.product, productValue\)/);
  assert.match(source, /JSON\.parse\(extraData\)/);
});
