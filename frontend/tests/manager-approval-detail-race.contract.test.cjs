const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/Reports.tsx'), 'utf8');

test('single approval uses captured report id and does not close newer detail', () => {
  assert.match(source, /const approvedId = Number\(detail\.id\)/);
  assert.match(source, /const requestSeq = detailRequestSeqRef\.current/);
  assert.match(source, /await approveSelectedTempReports\(\[approvedId\]\)/);
  assert.match(source, /if \(detailRequestSeqRef\.current === requestSeq\) closeDetail\(\)/);
});
test('shared-machine fallback does not navigate from stale detail', () => {
  assert.match(source, /code === "MACHINE_EVENT_REQUIRED" && detailRequestSeqRef\.current === requestSeq/);
  assert.match(source, /navigate\(\x60\$\{basePath\}\/report\/\$\{approvedId\}\?source=pending\x60\)/);
});
