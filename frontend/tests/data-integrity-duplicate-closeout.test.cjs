const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('separate-run request sends server duplicate challenge and fresh client request id', () => {
  const page = read('src/pages/worker/ProcessPage.tsx');
  assert.match(page, /client_request_id:\s*crypto\.randomUUID\(\)/);
  assert.match(page, /force_create:\s*true/);
  assert.match(page, /duplicate_confirmation_token:\s*duplicatePrompt\.confirmationToken/);
});

test('normal worker form has no first-submit force_create flag', () => {
  const page = read('src/pages/worker/ProcessPage.tsx');
  assert.equal((page.match(/force_create:\s*true/g) || []).length, 1);
  const handler = page.indexOf('const handleCreateDuplicateAnyway');
  const force = page.indexOf('force_create: true');
  assert.ok(handler >= 0 && force > handler);
});

test('approved duplicate prompt disables edit-existing worker action', () => {
  const page = read('src/pages/worker/ProcessPage.tsx');
  const actions = read('src/pages/worker/components/ProcessSubmitActions.tsx');
  assert.match(page, /reportType:\s*duplicateResponse\.data\?\.report_type === "approved"/);
  assert.match(page, /canUpdateExisting=\{duplicatePrompt\?\.reportType !== "approved"\}/);
  assert.match(actions, /canUpdateExisting &&/);
});

test('duplicate prompt still preserves explicit cancel/edit/create UX for temp collision', () => {
  const actions = read('src/pages/worker/components/ProcessSubmitActions.tsx');
  assert.match(actions, /Phát hiện báo cáo tương tự/);
  assert.match(actions, /Chỉnh sửa báo cáo cũ/);
  assert.match(actions, /Vẫn tạo báo cáo mới/);
});
