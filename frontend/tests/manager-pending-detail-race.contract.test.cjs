const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/Reports.tsx'), 'utf8');

test('pending detail requests are invalidated on close and filter changes', () => {
  assert.match(source, /const detailRequestSeqRef = useRef\(0\)/);
  assert.match(source, /const closeDetail = \(\) => \{\s*detailRequestSeqRef\.current \+= 1/);
  assert.match(source, /detailRequestSeqRef\.current \+= 1;\s*setPage\(1\)/);
  assert.match(source, /onClick=\{closeDetail\}/);
});
test('stale detail response cannot overwrite the current selection', () => {
  assert.match(source, /const requestSeq = \+\+detailRequestSeqRef\.current/);
  assert.match(source, /if \(isCurrent\(\)\) setDetail\(full \|\| report\)/);
  assert.match(source, /if \(isCurrent\(\)\) setDetailLoading\(false\)/);
});
