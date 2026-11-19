# KTC Phase 2 deferred batch 1/5 — Manager Pending/Approved (D-05, D-04)

Date: 2026-11-19. Branch: `refactor/ktc-local-cleanup`.

## Outcomes

**Code refactor completed, focused CI PASS, interactive browser acceptance still pending.**

The Pending Manager/Admin Ops route previously installed `MutationObserver`, document capture click listener, `ktc:manager-pending-page-data` custom event, DOM table replacement, checkbox-node moves, row index guessing and a dynamically injected `style` tag. This could desynchronize React's checked state, change bulk selection unexpectedly and open the wrong pending report.

Changed source:
- `frontend/src/pages/manager/Reports.tsx`: renders the full 14-column Pending table directly from React `reports` state, with stable `data-report-id`, report-code collision disambiguation, historical training snapshot priority, six KPI metrics and status, React-owned select-all and per-row checkboxes. Accepts optional `onOpenPendingReport(report)` so Admin/other existing pages can retain inline detail behavior.
- `frontend/src/pages/manager/ManagerReportWorkspaceFix.tsx`: replaced all global DOM mutation, observers and interception with an explicit callback. Pending route navigates using the clicked report's validated ID and existing encoded report-key parameters; Manager and Admin Ops prefixes derived from `useLocation`. Approved navigation still uses stable ID callback.
- `frontend/src/pages/manager/ManagerReportWorkspace.css`: scoped desktop/mobile visual styles; no body class, dynamic stylesheet or global observer.
- `frontend/tests/manager-pending-native-table.contract.test.cjs`: source contract for table shape, ID navigation, keyboard, selection, safeguards and CSS.
- `frontend/tests/manager-approved-native-navigation.contract.test.cjs`: replaced obsolete assertion requiring Pending DOM hacks.
- `.github/workflows/phase2-consolidated-safe.yml`: includes new Manager contract and observes affected Manager source changes.

No backend controllers, database tables, worker reporting submissions, Excel templates or production reports were modified.

## Safety verification

Read-only inspection of Cloudflare build triggers for `ktc-fe-test` and `ktc-be-test` confirmed both are configured to build from branch `test`, not `refactor/ktc-local-cleanup`. This refactor used no manual deployment/merge or database writes.

GitHub Actions run: **[44504790741](https://github.com/Nan1233/worker-management-system/actions/runs/44504790741)**, on exact application/test source SHA `7ea510032d8e7428e422b39d47cb4dc65d25a830`.
- Backend: 43/43 selected pure/mocked tests PASS and syntax/source check PASS
- Frontend: 16/16 selected contract tests PASS, TypeScript typecheck PASS, ESLint PASS, Vite build PASS
- Desktop: 21/21 selected pure/Excel-contract tests PASS, JavaScript renderer syntax PASS
- Final consolidated summary: SUCCESS (4/4 jobs)

These are source/contract tests and a build; they **do not simulate clicking a row or selecting checkbox in a real browser**, nor do they validate live API behavior.

## Remaining D-04/D-05 browser acceptance

Status of both ledger rows: **PARTIAL** until the following pass on an isolated fixture environment:

1. Manager Pending: click different rows; verify `/manager/report/review` contains the correct `id` and key after filters, page changes and changing date range; Enter and Space open the same report, checkbox click does not navigate.
2. Admin Ops Pending: same under `/admin-ops/report/review`; verify permission guard for unauthorized users.
3. Selection: check/uncheck individual row, select all visible, half-selection indeterminate, change filters/pages clears selection, bulk approve only chosen IDs, reject reason required, failed IDs remain selected only in original page scope.
4. Empty/error/loading states: one 14-column colspan row, no forced horizontal scroll for empty table.
5. Visual parity: desktop/mobile widths and light/dark, sticky checkbox, 14 headings, highlight KPI values, correct report-code disambiguation, no misplaced checkbox or blank cells.
6. Approved: Manager/Admin Ops clicked row ID matches destination even after searching and using pagination; keyboard support.

No shared TEST or production database; use mocked API or disposable isolated DB accounts.

## Remaining project ledger

D-01..D-20 states are preserved in `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md`: after this batch **7 PASS, 9 PARTIAL, 4 OPEN**. D-04/D-05 moved from OPEN to PARTIAL; all other entries unchanged.

**Next batch:** batch 2/5: D-09 Worker (draft, submission, offline), D-16 Master Control permissions, D-17 Admin UI responsive/dark mode. Re-use recorded green CI checks and run only impacted tests.
