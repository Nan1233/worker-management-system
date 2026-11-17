const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.resolve(__dirname, '../src', p), 'utf8');

test('phase 4 worker history supports recoverable error and filter-empty states', () => {
  const s = read('pages/worker/ProductionHistory.tsx');
  assert.match(s, /Thử tải lại/);
  assert.match(s, /role="alert"/);
  assert.match(s, /Không tìm thấy báo cáo phù hợp/);
  assert.match(s, /Chưa có báo cáo nào/);
});
test('phase 4 worker entry focuses validation and handles offline submission', () => {
  const s = read('pages/worker/ProcessPage.tsx');
  assert.match(s, /focusValidationTarget\(validationMessage\)/);
  const focus = read('pages/worker/processValidationFocus.ts');
  assert.match(s, /focusProcessValidationTarget/);
  assert.match(focus, /selector = '#ttNg'/);
  assert.match(s, /enqueueOfflineReport/);
});
test('phase 4 manager detail ignores obsolete requests', () => {
  const s = read('pages/manager/Reports.tsx');
  assert.match(s, /detailRequestSeqRef/);
  assert.match(s, /if \(isCurrent\(\)\) setDetail\(full \|\| report\)/);
});
test('phase 4 desktop Excel handles auth, concurrent actions and feedback', () => {
  const s = read('pages/manager/ApprovedReportsDesktopActions.tsx');
  assert.match(s, /syncLockRef\.current/);
  assert.match(s, /getToday\(\)/);
  assert.match(s, /aria-busy=\{busy\}/);
  assert.match(s, /setSyncMessage\("Phiên đăng nhập đã hết hạn/);
  assert.match(s, /role="status" aria-live="polite"/);
  assert.doesNotMatch(s, /window\.alert\(/);
});
