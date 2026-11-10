const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/worker/ProductionHistory.tsx'), 'utf8');

test('worker history allows retry after a failed load', () => {
  assert.match(source, /setReloadKey\(value => value \+ 1\)/);
  assert.match(source, /\[reloadKey\]/);
  assert.match(source, /role="alert"/);
  assert.match(source, /Thử tải lại/);
});
test('history ignores results after unmount and distinguishes empty search', () => {
  assert.match(source, /let cancelled = false/);
  assert.match(source, /if \(!cancelled\) setReports/);
  assert.match(source, /if \(!cancelled\) setError/);
  assert.match(source, /return \(\) => \{ cancelled = true; \}/);
  assert.match(source, /Chưa có báo cáo nào/);
  assert.match(source, /Không tìm thấy báo cáo phù hợp/);
  assert.match(source, /Xóa bộ lọc/);
});
