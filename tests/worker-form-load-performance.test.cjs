const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'frontend/src/pages/worker/ProcessPage.tsx'), 'utf8');

test('worker form uses short-lived cached profile instead of forcing a network request on every mount', () => {
  assert.match(source, /await getCurrentWorker\(\)/);
  assert.doesNotMatch(source, /await getCurrentWorker\(true\)/);
});

test('submit button stays disabled only while worker identity is loading or a submission is in flight', () => {
  const actions = fs.readFileSync(path.join(__dirname, '..', 'frontend/src/pages/worker/components/ProcessSubmitActions.tsx'), 'utf8');
  assert.match(actions, /disabled=\{loadingWorker \|\| submitting\}/);
});
