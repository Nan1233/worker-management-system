const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const hook = fs.readFileSync(path.join(root, 'src/pages/worker/useProcessMasterData.ts'), 'utf8');
const normalizer = fs.readFileSync(path.join(root, 'src/pages/worker/processMasterDataNormalization.ts'), 'utf8');

// Master data is normalized with the resolved process ID, preserving DB scope.
assert.match(hook, /normalizeDefectOptions\(defects\.value,\s*resolvedProcessId\)/);
assert.match(hook, /normalizeDeductionOptions\(deductions\.value,\s*resolvedProcessId\)/);
assert.match(normalizer, /row\.defect_code \?\? row\.code/);
assert.match(normalizer, /row\.defect_name \?\? row\.label \?\? row\.name/);
assert.match(normalizer, /row\.deduction_code \?\? row\.code/);
assert.match(normalizer, /row\.deduction_name \?\? row\.label \?\? row\.name/);
// Stable keys prefer DB IDs and canonical DB codes, not synthetic fallback codes.
assert.match(normalizer, /defect:\$\{id\}/);
assert.match(normalizer, /code:\$\{code\.toUpperCase\(\)\}/);
assert.match(normalizer, /deduction:\$\{id\}/);
assert.match(normalizer, /rowProcessId === Number\(processId\)/);
assert.match(normalizer, /label: name \|\| code \|\|/);
assert.match(normalizer, /Lỗi NG/);
assert.match(normalizer, /Trừ giờ/);

console.log('process-master-data-normalization: PASS');
