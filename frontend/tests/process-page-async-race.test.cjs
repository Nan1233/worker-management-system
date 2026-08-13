const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'worker', 'ProcessPage.tsx'), 'utf8');

test('machine standard resolver ignores stale async responses', () => {
  assert.match(source, /machineStandardRequestSeqRef/);
  assert.match(source, /const isCurrentRequest = \(\) => machineStandardRequestSeqRef\.current\[index\] === requestSeq/);
  assert.match(source, /if \(!isCurrentRequest\(\)\) return;[\s\S]*resolved_output_per_hour/);
});

test('worker and master-data loads are fenced when process changes', () => {
  assert.match(source, /workerInfoRequestSeqRef/);
  assert.match(source, /masterDataRequestSeqRef/);
  assert.match(source, /\[processInfo\.id, processCode, showToast\]/);
});
