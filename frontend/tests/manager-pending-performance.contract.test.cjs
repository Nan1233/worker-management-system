const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('pending report workspace reuses page data instead of polling or fetching a duplicate list', () => {
  const workspace = read('src/pages/manager/ManagerReportWorkspaceFix.tsx');
  assert.doesNotMatch(workspace, /getPendingReports/);
  assert.doesNotMatch(workspace, /setInterval/);
  assert.match(workspace, /ktc:manager-pending-page-data/);
  assert.match(workspace, /removeEventListener\("ktc:manager-pending-page-data", onPageData\)/);
});

test('pending report page aborts stale requests and skips the old page when filters reset', () => {
  const page = read('src/pages/manager/Reports.tsx');
  const service = read('src/services/productionService.ts');
  assert.match(page, /new AbortController\(\)/);
  assert.match(page, /reportAbortRef\.current\?\.abort\(\)/);
  assert.match(page, /filtersChanged && page !== 1/);
  assert.match(page, /signal: controller\.signal/);
  assert.match(service, /signal\?:AbortSignal/);
  assert.match(service, /signal:filters\.signal/);
});

test('opening pending report details computes metrics from current page data without another list API request', () => {
  const detail = read('src/pages/manager/PendingReportDetailFocus.ts');
  assert.doesNotMatch(detail, /api\.get/);
  assert.doesNotMatch(detail, /production-temp\/pending/);
  assert.match(detail, /ktc:manager-pending-page-data/);
  assert.match(detail, /pendingPageReports\.find/);
});
