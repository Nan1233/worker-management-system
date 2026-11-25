'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (name) => fs.readFileSync(path.join(__dirname, '../src/pages/manager', name), 'utf8');

test('Manager Pending table is entirely React-owned: 14 cells, real selection checkboxes and stable IDs', () => {
  const reports = read('Reports.tsx');
  const pendingTable = read('components/PendingReportTable.tsx');
  const presentation = read('pendingReportPresentation.ts');
  const view = read('ManagerReportWorkspaceFix.tsx');
  assert.match(reports, /<PendingReportTable/);
  assert.match(reports, /<PendingReportDetail/);
  assert.match(reports, /<PendingRejectDialog/);
  assert.match(reports, /onOpenPendingReport\?: \(report: ProductionReport\) => void/);
  assert.match(pendingTable, /reports\.map\(\(r, i\) =>/);
  assert.match(pendingTable, /data-report-id=\{r\.id\}/);
  assert.match(pendingTable, /onClick=\{\(\) => onOpenRow\(r\)\}/);
  assert.match(pendingTable, /e\.key === "Enter" \|\| e\.key === " "/);
  assert.match(pendingTable, /colSpan=\{14\}/);
  assert.match(pendingTable, /"Mã báo cáo", "Công nhân"/);
  assert.match(pendingTable, /"Trạng thái"/);
  assert.match(pendingTable, /"pending-full-productivity"/);
  assert.match(presentation, /values\.training_percent_snapshot \?\? values\.training_percent/);
  assert.match(pendingTable, /pct\(pendingTrainingPercent\(r\)\)/);
  assert.match(pendingTable, /"pending-full-pp"/);
  assert.match(pendingTable, /checked=\{selectedIds\.includes\(Number\(r\.id\)\)\}/);
  assert.match(pendingTable, /onChange=\{\(\) => onToggleSelected\(Number\(r\.id\)\)\}/);
  assert.match(pendingTable, /onClick=\{e => e\.stopPropagation\(\)\}/);
  assert.match(pendingTable, /onChange=\{onToggleVisibleSelection\}/);
  assert.match(pendingTable, /allVisibleSelected/);
  assert.doesNotMatch(reports + pendingTable, /ktc:manager-pending-page-data/);
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
    'approveSelectedTempReports([approvedId])', 'approvePendingReportBatch', 'rejectPendingReportBatch',
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
