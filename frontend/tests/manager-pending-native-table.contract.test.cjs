'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.join(__dirname, '../src/pages/manager', name), 'utf8');

test('Manager Pending table is entirely React-owned: 14 cells, real selection checkboxes and stable IDs', () => {
  const reports = read('Reports.tsx');
  const view = read('ManagerReportWorkspaceFix.tsx');
  assert.match(reports, /onOpenPendingReport\?: \(report: ProductionReport\) => void/);
  assert.match(reports, /reports\.map\(\(r, i\) =>/);
  assert.match(reports, /data-report-id=\{r\.id\}/);
  assert.match(reports, /onClick=\{\(\) => openRow\(r\)\}/);
  assert.match(reports, /e\.key === "Enter" \|\| e\.key === " "/);
  assert.match(reports, /colSpan=\{14\}/);
  assert.match(reports, /"Mã báo cáo", "Công nhân"/);
  assert.match(reports, /"Trạng thái"/);
  assert.match(reports, /"pending-full-productivity"/);
  assert.match(reports, /values\.training_percent_snapshot \?\? values\.training_percent/);
  assert.match(reports, /pct\(pendingTrainingPercent\(r\)\)/);
  assert.match(reports, /"pending-full-pp"/);
  assert.match(reports, /checked=\{selectedIds\.includes\(Number\(r\.id\)\)\}/);
  assert.match(reports, /onChange=\{\(\) => toggleSelected\(Number\(r\.id\)\)\}/);
  assert.match(reports, /onClick=\{e => e\.stopPropagation\(\)\}/);
  assert.match(reports, /onChange=\{toggleVisibleSelection\}/);
  assert.match(reports, /allVisibleSelected/);
  assert.doesNotMatch(reports, /ktc:manager-pending-page-data/);
  assert.doesNotMatch(view, /MutationObserver|document\.createElement|addEventListener|querySelector|stopPropagation|installPendingTableFix/);
});

test('manager and admin-ops native routing uses each clicked report ID, not a row position', () => {
  const view = read('ManagerReportWorkspaceFix.tsx');
  assert.match(view, /location\.pathname\.startsWith\("\/admin-ops"\)/);
  assert.match(view, /Number\.isSafeInteger\(id\) \|\| id <= 0/);
  assert.match(view, /report\/review\?source=pending&date=/);
  assert.match(view, /&id=\$\{id\}/);
  assert.match(view, /<Reports onOpenPendingReport=\{openReport\} \/>/);
  assert.match(view, /onOpenReport=\{\(id\) => navigate/);
});

test('bulk approval, rejection, paging and filter selection are still React controlled', () => {
  const reports = read('Reports.tsx');
  for (const required of [
    'approveSelectedTempReports', 'approveTempReport', 'rejectSelectedTempReports',
    'toggleSelected', 'toggleVisibleSelection', 'selectionScopeRef',
    'setSelectedIds(failedIds)', 'openRejectDialog(selectedIds)',
    'getPendingReports({', 'pageSize: 8', 'setPage(p =>'
  ]) assert.ok(reports.includes(required), 'Missing selection/approval contract: ' + required);
});

test('pending CSS is locally scoped and no longer injected by a DOM observer', () => {
  const css = read('ManagerReportWorkspace.css');
  assert.match(css, /\.ktc-manager-report-workspace \.pending-reference-table/);
  assert.match(css, /pending-full-productivity/);
  assert.doesNotMatch(css, /body\.ktc-report-workspace-fix/);
});
