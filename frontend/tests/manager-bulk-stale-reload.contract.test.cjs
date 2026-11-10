const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/Reports.tsx'), 'utf8');
test('bulk approval and rejection refresh only their original filter and page', () => {
  assert.equal((src.match(/if \(selectionScopeRef\.current === selectionScope\) await load\(\);/g) || []).length, 2);
  assert.match(src, /const selectionScope = selectionScopeRef\.current/);
  assert.match(src, /selectionScopeRef\.current = JSON\.stringify\(\[filterKey, page\]\)/);
});
