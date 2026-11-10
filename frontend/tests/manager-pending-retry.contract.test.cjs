const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/Reports.tsx'), 'utf8');

test('manager pending reports exposes accessible retry on API failure', () => {
  assert.match(source, /className="management-error"[\s\S]*?<div role="alert">\{error\}<\/div>/);
  assert.match(source, /onClick=\{\(\) => void load\(\)\} disabled=\{loading\}/);
  assert.match(source, /Thử tải lại/);
});
test('retry shares latest-request cancellation and restores loading state', () => {
  assert.match(source, /const requestSeq = \+\+reportLoadSeqRef\.current/);
  assert.match(source, /reportAbortRef\.current\?\.abort\(\)/);
  assert.match(source, /if \(!isCurrentRequest\(\)\) return/);
  assert.match(source, /if \(isCurrentRequest\(\)\) setLoading\(false\)/);
});
