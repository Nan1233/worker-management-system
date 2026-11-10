const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../src/pages/worker/ProcessPage.tsx'), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'expected duplicate handler');
  return source.slice(from, to);
};

test('duplicate create and update resume pending split payloads without replaying primary', () => {
  for (const [start, end] of [
    ['const handleCreateDuplicateAnyway = async () => {', 'const handleUpdateExistingReport = async () => {'],
    ['const handleUpdateExistingReport = async () => {', '// Separate-run duplicate creation'],
  ]) {
    const action = section(start, end);
    assert.match(action, /if \(!duplicatePrimaryCompletedRef\.current\) \{/);
    assert.match(action, /duplicatePrimaryCompletedRef\.current = true;/);
    assert.match(action, /if \(pendingCount\) enqueueOfflineReports\(pendingSplitPayloadsRef\.current\)/);
    assert.ok(action.indexOf('enqueueOfflineReports(pendingSplitPayloadsRef.current)') < action.indexOf('finishDuplicateAction()'));
    assert.doesNotMatch(action, /pendingSplitPayloadsRef\.current = \[\];/);
  }
});

test('completed primary is reset on successful finish and new duplicate challenge', () => {
  const finish = section('const finishDuplicateAction = useCallback(', 'const handleCreateDuplicateAnyway = async () => {');
  assert.match(finish, /duplicatePrimaryCompletedRef\.current = false;/);
  const submit = section('const handleSubmit =', 'showToast("Lưu báo cáo thành công. Các báo cáo đã được gửi chờ duyệt."');
  assert.match(submit, /duplicatePrimaryCompletedRef\.current = false;/);
});
