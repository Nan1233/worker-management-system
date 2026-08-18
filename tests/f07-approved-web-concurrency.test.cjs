const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('F07 FE 01 EditReport stores server updated_at in immutable edit-session ref', () => {
  const source = read('frontend/src/pages/manager/EditReport.tsx');
  assert.match(source, /useRef<string \| null>\(null\)/);
  assert.match(source, /originalUpdatedAtRef\.current = source === "approved" \? \(data\.updated_at \|\| null\) : null/);
  assert.doesNotMatch(source, /setField\("updated_at"/);
});

test('F07 FE 02 approved update request sends expected_updated_at from immutable baseline', () => {
  const page = read('frontend/src/pages/manager/EditReport.tsx');
  const service = read('frontend/src/services/productionService.ts');
  assert.match(page, /updateReport\(reportId, payload, source, originalUpdatedAtRef\.current\)/);
  assert.match(service, /expected_updated_at: expectedUpdatedAt \|\| undefined/);
  assert.doesNotMatch(service, /expected_updated_at:\s*new Date/);
});

test('F07 FE 03 conflict maps to specific reload/review UX and preserves local form', () => {
  const source = read('frontend/src/pages/manager/EditReport.tsx');
  assert.match(source, /code === "REPORT_VERSION_CONFLICT"/);
  assert.match(source, /Báo cáo đã được người khác cập nhật\. Vui lòng tải lại dữ liệu trước khi lưu/);
  assert.match(source, /Các thay đổi bạn đang nhập vẫn được giữ trên màn hình/);
});

test('F07 FE 04 conflict path does not auto-resubmit stale edit', () => {
  const source = read('frontend/src/pages/manager/EditReport.tsx');
  const conflict = source.indexOf('code === "REPORT_VERSION_CONFLICT"');
  const tail = source.slice(conflict, source.indexOf('const apiErrors', conflict));
  assert.doesNotMatch(tail, /updateReport\(/);
  assert.match(tail, /return;/);
});

test('F07 FE 05 successful save advances concurrency baseline to returned updated_at', () => {
  const source = read('frontend/src/pages/manager/EditReport.tsx');
  assert.match(source, /originalUpdatedAtRef\.current = result\?\.data\?\.updated_at \|\| originalUpdatedAtRef\.current/);
});

test('F07 FE 06 approved edit refuses save if loaded server token is unavailable', () => {
  const source = read('frontend/src/pages/manager/EditReport.tsx');
  assert.match(source, /source === "approved" && !originalUpdatedAtRef\.current/);
  assert.match(source, /thiếu thông tin phiên bản cập nhật/);
});
