const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const hook = fs.readFileSync(path.join(root, 'src/pages/worker/useProcessMasterData.ts'), 'utf8');
const normalizer = fs.readFileSync(path.join(root, 'src/pages/worker/processMasterDataNormalization.ts'), 'utf8');

assert.match(hook, /normalizeDefectOptions\(defects\.value\)/);
assert.match(hook, /normalizeDeductionOptions\(deductions\.value\)/);
assert.match(normalizer, /row\.defect_code \?\? row\.code/);
assert.match(normalizer, /row\.defect_name \?\? row\.label/);
assert.match(normalizer, /row\.deduction_code \?\? row\.code/);
assert.match(normalizer, /row\.deduction_name \?\? row\.label/);
assert.match(normalizer, /key\s*=\s*clean\(configured\?\.key\) \|\| canonicalCode/);
assert.match(normalizer, /label\s*=\s*name \|\| clean\(configured\?\.label\) \|\| canonicalCode/);

console.log('process-master-data-normalization: PASS');
