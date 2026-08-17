const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('logout flow uses canonical server logout while clearing local identity immediately', () => {
  const auth = read('src/services/authService.ts');
  const worker = read('src/layouts/WorkerLayout.tsx');
  const manager = read('src/layouts/ManagementLayout.tsx');
  const clearIndex = auth.indexOf('clearAuthSession();', auth.indexOf('export const logout'));
  const postIndex = auth.indexOf('await api.post(', auth.indexOf('export const logout'));
  assert.ok(clearIndex >= 0 && postIndex > clearIndex, 'local identity must retire before waiting for logout network');
  assert.match(worker, /import \{ logout \} from "\.\.\/services\/authService"/);
  assert.match(worker, /void logout\(\);[\s\S]{0,80}navigate\("\/login"/);
  assert.match(manager, /import \{ logout \} from "\.\.\/services\/authService"/);
  assert.match(manager, /void logout\(\);[\s\S]{0,80}navigate\("\/login"/);
});

test('login keeps one retry for transient failures but never auto-retries rate limit 429', () => {
  const auth = read('src/services/authService.ts');
  const statuses = auth.match(/RETRYABLE_LOGIN_STATUSES = new Set\(\[([^\]]+)\]\)/)?.[1] || '';
  assert.match(auth, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.doesNotMatch(statuses, /(?:^|,)\s*429\s*(?:,|$)/);
  assert.match(statuses, /500/);
});

test('worker 429 preserves form and is not put into the offline mutation queue', () => {
  const page = read('src/pages/worker/ProcessPage.tsx');
  const catchIndex = page.indexOf('} catch (error: any) {');
  const rateIndex = page.indexOf('=== 429', catchIndex);
  const transientIndex = page.indexOf('isTransientNetworkFailure(error)', catchIndex);
  const enqueueIndex = page.indexOf('enqueueOfflineReport(payload)', catchIndex);
  assert.ok(rateIndex > catchIndex && rateIndex < transientIndex, '429 must be handled before transient/offline classification');
  assert.ok(enqueueIndex > transientIndex, 'offline queue must remain only on transient path');
  assert.match(page.slice(rateIndex, transientIndex), /showToast\([\s\S]*"warning"\)/);
  assert.match(page.slice(rateIndex, transientIndex), /return;/);
});

test('duplicate confirmation is bound to the current form snapshot and synchronously locked', () => {
  const page = read('src/pages/worker/ProcessPage.tsx');
  assert.match(page, /formSignature:\s*getDuplicateFormSignature\(\)/);
  assert.match(page, /duplicatePrompt\.formSignature === getDuplicateFormSignature\(\)/);
  assert.match(page, /Dữ liệu trên form đã thay đổi sau khi phát hiện báo cáo trùng/);
  assert.match(page, /handleCreateDuplicateAnyway = async \(\) => \{[\s\S]{0,180}submitLockRef\.current[\s\S]{0,180}submitLockRef\.current = true/);
  assert.match(page, /handleUpdateExistingReport = async \(\) => \{[\s\S]{0,220}submitLockRef\.current[\s\S]{0,220}submitLockRef\.current = true/);
});

test('manager pending flow keeps admin navigation inside the admin route family', () => {
  const reports = read('src/pages/manager/Reports.tsx');
  assert.match(reports, /currentUser\?\.role === "admin"[\s\S]{0,80}\? "\/admin"/);
  assert.match(reports, /navigate\(\s*`\$\{basePath\}\/reports\/review`/);
});

test('manager approve and reject mutations share a synchronous action lock', () => {
  const reports = read('src/pages/manager/Reports.tsx');
  assert.match(reports, /const actionLockRef = useRef\(false\)/);
  assert.match(reports, /handleApproveSelected = async \(\) => \{[\s\S]{0,160}actionLockRef\.current \|\| actionLoading/);
  assert.match(reports, /handleRejectSelected = async \(\) => \{[\s\S]{0,160}actionLockRef\.current \|\| actionLoading/);
  const sets = reports.match(/actionLockRef\.current = true/g) || [];
  const clears = reports.match(/actionLockRef\.current = false/g) || [];
  assert.equal(sets.length, 2);
  assert.equal(clears.length, 2);
});

test('approved conflict keeps draft state and reports an actionable 409 message', () => {
  const edit = read('src/pages/manager/EditReport.tsx');
  const conflict = edit.indexOf('code === "REPORT_VERSION_CONFLICT"');
  assert.ok(conflict >= 0);
  const window = edit.slice(conflict, conflict + 500);
  assert.match(window, /Các thay đổi bạn đang nhập vẫn được giữ trên màn hình/);
  assert.doesNotMatch(window, /setForm\(/);
});

test('Excel import UI distinguishes no-change, partial success and full success', () => {
  const approved = read('src/pages/manager/ApprovedReports.tsx');
  assert.match(approved, /File không có dòng mới hoặc thay đổi cần import/);
  assert.match(approved, /result\.failed > 0[\s\S]{0,180}warning/);
  assert.match(approved, /Import thành công \$\{result\.succeeded\} báo cáo/);
  assert.match(approved, /applyReportImport\(token, reportImportPreview\.filePath\)/);
});
