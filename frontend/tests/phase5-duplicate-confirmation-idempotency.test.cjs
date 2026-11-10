const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/pages/worker/ProcessPage.tsx'), 'utf8');

test('forced duplicate uses a stable client request id across ambiguous retries', () => {
  const begin = source.indexOf('const handleCreateDuplicateAnyway = async () => {');
  const end = source.indexOf('const handleUpdateExistingReport = async () => {', begin);
  assert.ok(begin >= 0 && end > begin);
  const action = source.slice(begin, end);
  assert.match(action, /duplicateForceRequestIdRef\.current \|\|= createClientRequestId\(\);/);
  assert.match(action, /client_request_id: duplicateForceRequestIdRef\.current/);
  assert.doesNotMatch(action, /client_request_id: crypto\.randomUUID\(\)/);
  assert.match(action, /if \(!duplicatePrimaryCompletedRef\.current\)/);
});

test('new challenge and successful completion reset forced request id', () => {
  const finish = source.slice(source.indexOf('const finishDuplicateAction ='), source.indexOf('const handleCreateDuplicateAnyway ='));
  assert.match(finish, /duplicateForceRequestIdRef\.current = null/);
  const submit = source.slice(source.indexOf('const handleSubmit ='), source.indexOf('showToast("Lưu báo cáo thành công. Các báo cáo đã được gửi chờ duyệt."'));
  assert.match(submit, /duplicateForceRequestIdRef\.current = null/);
});

test('cancel cannot discard remaining split reports after confirmed primary', () => {
  const begin = source.indexOf('onCancelDuplicate={() => {');
  const end = source.indexOf('onUpdateExisting=', begin);
  assert.ok(begin >= 0 && end > begin);
  const cancel = source.slice(begin, end);
  assert.match(cancel, /if \(duplicatePrimaryCompletedRef\.current && pendingSplitPayloadsRef\.current\.length\)/);
  assert.ok(cancel.indexOf('return;') < cancel.indexOf('pendingSplitPayloadsRef.current = [];'));
});
