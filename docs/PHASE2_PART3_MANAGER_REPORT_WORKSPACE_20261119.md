# KTC Phase 2 — Part 3/10: Manager report workspace (2026-11-19)

Branch: `refactor/ktc-local-cleanup`. No DB write, schema migration, merge or deploy.

## Confirmed issue

`ManagerApprovedReportsWorkspaceFix` used global capture-phase click handler to:
- discover a clicked HTML row and its position,
- reconstruct filters from DOM,
- call `getApprovedReports` again with a hard-coded page size 8,
- navigate to `result.data[index].id`.

But `ApprovedReports.tsx` already owns the displayed reports in React state, fetches a page size **20**, and renders its own row click+keyboard handlers to open inline detail. Index-based navigation on an independently fetched 8-row page could select the wrong report or none; global capture stopped React row handlers. Also a no-op `MutationObserver` observed body on the approved route.

## Implemented

1. `ApprovedReports.tsx`: optional `onOpenReport(reportId)` prop. For manager/admin_ops, report row passes its real numeric ID through callback. When absent, original in-page approved detail panel behavior remains.
2. `ApprovedReportsDesktopActions.tsx`: forwards optional callback through every conditional desktop/browser/export-permission branch.
3. `ManagerReportWorkspaceFix.tsx`: approved route uses React callback navigation to `/manager/report/:id` or `/admin-ops/report/:id`, depending on route. Removed old global click handler, index lookup, refetch and approved-route body observer.
4. `frontend/tests/manager-approved-native-navigation.contract.test.cjs`: added contract checks for stable ID navigation, callback propagation, keyboard handling and preservation of pending flow.
5. Re-fetched source after changes: **8/8 independent static checks met**. Not a Node test pass.

## Commits

- `18ec2d1207b7243f255867317f7fe3066e71d574` — row callback
- `4d63f6e846e81f62c10c4b4608228f4270d36db8` — wrapper propagation
- `5115ece3e051b83473f2dc8e981602e4ca38b430` — remove approved DOM interceptor
- `3b2778ad0525ac984cd8773ab74dbc5c60cc06bf` — contract test

## Deferred

**Important: Pending reports DOM reconstruction remains unchanged**. `installPendingTableFix` rebuilds 14-column header/rows and moves live checkboxes, with global click capture, window custom events and MutationObserver. Removing this without preserving its extra KPIs and bulk selection risks behavioral regressions. Record as D-05 for a future safe React-owned migration.

Runtime test, typecheck, lint, browser interaction and visual regression are not run in this environment; D-01, D-02, D-04, D-06 remain open.

## Focused check commands (isolated checkout)

```bash
cd frontend
node --test tests/manager-approved-native-navigation.contract.test.cjs
node --test tests/machine-event-participant-api.contract.test.cjs
npm run typecheck
npm run lint
```

Browser regression for manager/admin_ops approved report: row mouse, Enter/Space, pagination > 8 items, search, date range, shift, report ID selected, Desktop export button unaffected. For lead/admin, inline approved detail must still work. No production release until evidence gates close.

### Acceptance summary

**Approved-navigation refactor implemented and source-verified. Part 3 overall: partial**, pending DOM reconstruction and UI/regression checks are deferred and tracked in `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md`. Do not claim full P3 completion.
