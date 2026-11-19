'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('approved manager rows navigate by stable report ID without DOM index/refetch', () => {
  const workspace = read('src/pages/manager/ManagerReportWorkspaceFix.tsx');
  const approved = read('src/pages/manager/ApprovedReports.tsx');
  const desktop = read('src/pages/manager/ApprovedReportsDesktopActions.tsx');

  assert.match(workspace, /ManagerApprovedReportsWorkspaceFix/);
  assert.match(workspace, /<ApprovedReportsDesktopActions onOpenReport=/);
  assert.match(workspace, /\/report\/\$\{id\}/);
  assert.doesNotMatch(workspace, /installApprovedNavigationFix|getApprovedReports/);

  assert.match(approved, /onOpenReport\?: \(reportId: number\) => void/);
  assert.match(approved, /Number\.isSafeInteger\(reportId\) && reportId > 0/);
  assert.match(approved, /onOpenReport\(reportId\)/);
  assert.match(approved, /onClick=\{\(\) => void openDetail\(r\)\}/);
  assert.match(approved, /e\.key === "Enter" \|\| e\.key === " "/);
  assert.match(desktop, /<ApprovedReports onOpenReport=\{onOpenReport\} \/>/);
  assert.equal(desktop.match(/<ApprovedReports onOpenReport=\{onOpenReport\} \/>/g)?.length, 3);
});

test('pending workspace behavior is retained until checkbox/DOM refactor is tested', () => {
  const workspace = read('src/pages/manager/ManagerReportWorkspaceFix.tsx');
  assert.match(workspace, /installPendingTableFix/);
  assert.match(workspace, /ktc:manager-pending-page-data/);
  assert.match(workspace, /pending-reference-table/);
});
