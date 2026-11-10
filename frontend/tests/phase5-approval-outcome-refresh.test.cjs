const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/pages/manager/Reports.tsx'), 'utf8');
const body = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'expected manager action section');
  return source.slice(from, to);
};

test('single approval reports server success before optional refresh', () => {
  const action = body('const approveDetail = async () => {', 'const openRejectDialog =');
  const success = action.indexOf('window.alert("Đã duyệt báo cáo thành công.");');
  const refresh = action.indexOf('await load();');
  assert.ok(success >= 0 && refresh > success);
  assert.match(action, /if \(selectionScopeRef\.current === selectionScope\) await load\(\)/);
  assert.match(action, /if \(detailRequestSeqRef\.current === requestSeq\) closeDetail\(\)/);
});

test('bulk approval and rejection report results before optional refresh', () => {
  for (const [start, end, marker] of [
    ['const rejectTargets = async () => {', 'const visibleIds =', 'window.alert(`Đã từ chối'],
    ['const approveBulk = async () => {', 'const detailKpi =', 'window.alert(summary);'],
  ]) {
    const action = body(start, end);
    const success = action.indexOf(marker);
    const refresh = action.indexOf('await load();');
    assert.ok(success >= 0 && refresh > success, start);
    assert.match(action, /if \(selectionScopeRef\.current === selectionScope\) await load\(\)/);
  }
});
