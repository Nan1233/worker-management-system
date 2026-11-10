const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/Reports.tsx'), 'utf8');

test('pending report mutations are guarded during failed or ongoing reloads', () => {
  assert.match(src, /if \(!detail \|\| approving \|\| loading \|\| error \|\| managerActionLockRef\.current\) return/);
  assert.match(src, /if \(!targets\.length \|\| bulkApproving \|\| loading \|\| error \|\| managerActionLockRef\.current\) return/);
  assert.match(src, /if \(rejecting \|\| loading \|\| error \|\| !rejectTargetIds\.length \|\| managerActionLockRef\.current\) return/);
  assert.match(src, /if \(!validIds\.length \|\| rejecting \|\| loading \|\| error\) return/);
});
test('all approval and rejection controls are disabled for stale data', () => {
  assert.match(src, /disabled=\{selectedIds\.length === 0 \|\| bulkApproving \|\| loading \|\| Boolean\(error\)\}/);
  assert.match(src, /disabled=\{selectedIds\.length === 0 \|\| rejecting \|\| loading \|\| Boolean\(error\)\}/);
  assert.match(src, /disabled=\{approving \|\| detailLoading \|\| rejecting \|\| loading \|\| Boolean\(error\)\}/);
});
