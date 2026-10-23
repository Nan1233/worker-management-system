const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'manager', 'SelectedReportsReview.tsx'), 'utf8');

test('selected review loads each report independently so one failure does not hide the others', () => {
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /Không tải được \$\{ids\.length - data\.length\}\/\$\{ids\.length\} báo cáo/);
});

test('the load effect re-runs when the retry counter changes and the setter is wired', () => {
  assert.match(source, /const \[loadAttempt, setLoadAttempt\] = useState\(0\)/);
  assert.match(source, /\[source, storageKey, loadAttempt\]/);
});

test('an error shows an announced message with a Tải lại button that bumps the counter and is disabled while loading', () => {
  const block = source.match(/\{error && \([\s\S]*?\n {12}\)\}/)?.[0] || '';
  assert.match(block, /role="alert"/);
  assert.match(block, /aria-live="assertive"/);
  assert.match(block, /onClick=\{\(\) => setLoadAttempt\(\(attempt\) => attempt \+ 1\)\}/);
  assert.match(block, /disabled=\{loading\}/);
  assert.match(block, /Tải lại/);
});
