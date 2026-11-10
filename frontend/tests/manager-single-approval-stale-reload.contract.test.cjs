const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/Reports.tsx'), 'utf8');

test('single approval only refreshes its original filter and page', () => {
  const action = src.slice(src.indexOf('const approveDetail = async'), src.indexOf('const openRejectDialog ='));
  assert.match(action, /const selectionScope = selectionScopeRef\.current/);
  assert.match(action, /if \(selectionScopeRef\.current === selectionScope\) await load\(\)/);
  assert.match(action, /if \(detailRequestSeqRef\.current === requestSeq\) closeDetail\(\)/);
  assert.match(action, /window\.alert\("Đã duyệt báo cáo thành công\."\)/);
});
