const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/manager/ApprovedReportsDesktopActions.tsx'), 'utf8');

test('Excel export fallback uses local report date instead of UTC', () => {
  assert.match(source, /import \{ getToday \} from "\.\/managerReportDateLogic"/);
  assert.match(source, /document\.querySelector<HTMLInputElement>\("\.pending-filter-card input\[type=\x27date\x27\]"\)\?\.value \|\| getToday\(\)/);
  assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});
test('desktop sync prevents concurrent clicks and displays accessible result', () => {
  assert.match(source, /syncLockRef\.current\) return/);
  assert.match(source, /syncLockRef\.current = true/);
  assert.match(source, /syncLockRef\.current = false/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /setSyncMessage\("Đã cập nhật Excel thành công\."\)/);
});
