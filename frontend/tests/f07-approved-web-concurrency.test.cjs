const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('F07 FE 01 approved report editor stores server updated_at in an immutable edit-session ref', () => {
  const source = read('src/pages/worker/WorkerReportEditV2.tsx');
  assert.match(source, /useRef<string \| null>\(null\)/);
  assert.match(source, /approvedEditBaselineRef\.current = managerRoute && source === "approved" && data\.updated_at \? String\(data\.updated_at\) : null/);
  assert.doesNotMatch(source, /setField\("updated_at"/);
});

test('F07 FE 02 approved update request sends expected_updated_at from the immutable baseline', () => {
  const page = read('src/pages/worker/WorkerReportEditV2.tsx');
  const service = read('src/services/productionService.ts');
  assert.match(page, /updateReport\(Number\(report\.id\), requestPayload as ProductionReport, source, approvedBaseline \|\| report\.updated_at \|\| null\)/);
  assert.match(page, /payload\.expected_updated_at = approvedBaseline \|\| report\.updated_at/);
  assert.match(service, /expected_updated_at: expectedUpdatedAt \|\| undefined/);
  assert.doesNotMatch(service, /expected_updated_at:\s*new Date/);
});

test('F07 FE 03 version conflict gives actionable reload guidance and preserves the local form', () => {
  const source = read('src/pages/worker/WorkerReportEditV2.tsx');
  assert.match(source, /Number\(e\?\.response\?\.status\) === 409 \|\| e\?\.response\?\.data\?\.code === "REPORT_VERSION_CONFLICT"/);
  assert.match(source, /Báo cáo đã được người khác cập nhật\. Vui lòng tải lại dữ liệu trước khi lưu/);
  assert.match(source, /Các thay đổi bạn đang nhập vẫn được giữ trên màn hình/);
});

test('F07 FE 04 conflict path does not automatically resubmit stale edits', () => {
  const source = read('src/pages/worker/WorkerReportEditV2.tsx');
  const conflict = source.indexOf('Number(e?.response?.status) === 409');
  assert.notEqual(conflict, -1);
  const tail = source.slice(conflict, source.indexOf('} else {', conflict));
  assert.doesNotMatch(tail, /updateReport\(/);
  assert.match(tail, /return;/);
});

test('F07 FE 05 successful save advances the baseline only from the server response', () => {
  const source = read('src/pages/worker/WorkerReportEditV2.tsx');
  assert.match(source, /const savedUpdatedAt = savedResponse\?\.data\?\.updated_at \?\? savedResponse\?\.updated_at/);
  assert.match(source, /approvedEditBaselineRef\.current = String\(savedUpdatedAt\)/);
});

test('F07 FE 06 approved edit refuses to save when the server version token is unavailable', () => {
  const source = read('src/pages/worker/WorkerReportEditV2.tsx');
  assert.match(source, /managerRoute && source === "approved" && !approvedBaseline/);
  assert.match(source, /thiếu thông tin phiên bản cập nhật/);
});
