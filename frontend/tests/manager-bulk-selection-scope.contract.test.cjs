const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/Reports.tsx'), 'utf8');

test('bulk selection scope includes filters and page', () => {
  assert.match(source, /selectionScopeRef\.current = JSON\.stringify\(\[filterKey, page\]\)/);
  assert.equal((source.match(/const selectionScope = selectionScopeRef\.current/g) || []).length, 2);
});
test('bulk approve and reject cannot reselect failed reports in another scope', () => {
  assert.match(source, /if \(selectionScopeRef\.current === selectionScope\) setSelectedIds\(failedIds\)/);
  assert.match(source, /if \(selectionScopeRef\.current === selectionScope\) \{\s*setSelectedIds\(previous =>/);
  assert.match(source, /previous\.filter\(id => !rejectedIds\.includes\(id\)\)/);
});
