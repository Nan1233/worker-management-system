# KTC — Phase 2 deferred verification ledger (2026-11-19)

This ledger must be repeated in each chat progress report until closure and used for **one consolidated regression pass** at the end of Phase 2. Do not re-run checks that already have verifiable PASS evidence on the *same commit*; if affected files change, revalidate impacted checks.

| ID | Origin | Pending / blocked | Closure evidence | State |
|---|---|---|---|---|
| D-01 | Part 1 | Isolated repository checkout and exact SHA baseline; frontend lint/typecheck/build; backend check | Recorded command output and exit codes on a clean isolated checkout | PASS |
| D-02 | Part 1 | Safe isolated unit suites and Desktop synthetic Excel smoke; no shared TEST/production DB | Test runner logs, fixture isolation, no DB writes | PARTIAL |
| D-03 | Part 2 | Machine-event participant API Node contract test and TypeScript check, currently static-only | `node --test frontend/tests/machine-event-participant-api.contract.test.cjs`, typecheck pass | PASS |
| D-04 | Part 3 | Manager approved-row navigation React/UI regression (click, keyboard, filtering, pagination, admin_ops path) | Browser/component test evidence on isolated checkout | PARTIAL |
| D-05 | Part 3 | React-owned Pending table refactor completed; interactive browser selection, bulk approve/reject and responsive visual regression remain | Browser tests with fixture data prove checkbox, select all, filter, pagination, bulk approve/reject and layout | PARTIAL |
| D-06 | Part 3 | Manager approved navigation contract Node test | `node --test frontend/tests/manager-approved-native-navigation.contract.test.cjs` pass | PASS |
| D-07 | Cross-phase | Full permissions/transaction/shared-machine/Excel and end-to-end release gates | Consolidated run on isolated test DB and synthetic Excel, separately approved | OPEN |
| D-08 | Part 4 | Worker form hook simulation test and frontend typecheck | `node --test frontend/tests/f02-process-form-extracted-hooks.test.cjs` and typecheck PASS with pinned commit | PASS |
| D-09 | Part 4 | Worker submit/draft/offline/browser regression after extraction | Isolated browser integration test verifying unchanged payload, draft save warnings and standard lookup behavior | OPEN |
| D-10 | Part 5 | Repository Node test for shared proposal read normalization | `cd backend && node --test tests/report-edit-proposal-read-normalization.test.js` with exact checkout SHA | PASS |
| D-11 | Part 5 | Proposal review rollback/concurrency/scope behavior under isolated fixtures | Run `proposalReviewRollback.behavior.test.js`, `proposalReviewTransaction.contract.test.js` and permission tests; verify no DB writes | PARTIAL |
| D-12 | Part 6 | Execute child NG/deduction total validator tests and backend source checks on isolated checkout | `cd backend && node --test tests/production-child-totals-validation.test.js && npm run check` PASS with pinned SHA | PASS |
| D-13 | Part 6 | Verify submission idempotency, concurrent submissions, split machine lines and rollback against isolated fixtures | Backend regression/behavior tests, no shared TEST/production DB; record outcomes | PARTIAL |
| D-14 | Part 7 | Execute daily-hours parity and frozen historical snapshot/physical-machine tests on pinned checkout | `cd backend && node --test tests/production-daily-hours-parity-refactor.test.js`, reviewed historical/training/shared accounting suites and check command PASS | PARTIAL |
| D-15 | Part 7 | Validate end-to-end physical machine output counted once and snapshot historical KPIs unchanged after refactor | Isolated fixture parity across backend + desktop; approved snapshot check, no shared DB | OPEN |
| D-16 | Part 8 | Execute permission cache stale-response race tests, TS typecheck, permissions and Master Control regression on pinned checkout | `cd frontend && node --test tests/permission-cache-invalidation-race.test.cjs && npm run typecheck`; independently verify backend 403 on unauthorized roles with isolated fixtures | PARTIAL |
| D-17 | Part 8 | Permission matrix CSS/visual responsive checks, dark theme and admin user/role override interactions | CSS contract test plus browser visual and role matrix interaction evidence at desktop/mobile widths | PARTIAL |
| D-18 | Part 9 | Run new Desktop workbook naming parity test with pinned checkout; inspect packaging inclusion | `cd desktop && node --test tests/monthly-workbook-naming-parity.test.cjs` and desktop check/packaging tests PASS | PARTIAL |
| D-19 | Part 9 | Execute synthetic XLSX workbook parity for ten process sheets, formulas, styles, _KTC_SYNC, sync/import and template round-trip | Compare generated workbook outputs before/after on isolated fixture, checksum key cells, no production files/NAS writes | OPEN |
| D-20 | Part 10 | GitHub Actions consolidated workflow has not produced any recorded run (actions run list returned zero on branch after workflow commit) | One CI run on pinned SHA with backend/frontend/Desktop job results, logs and failures triaged | PASS |

## Final one-time CI results (2026-11-19) — source SHA `263b6e916d506aa05b0e2f0f69e3c2d04d1827c4`

GitHub Actions **run [44502489098](https://github.com/Nan1233/worker-management-system/actions/runs/44502489098)** finished SUCCESS with **all 4 jobs green**:

- Backend: `npm run check` PASS; **43/43** focused pure/mocked tests PASS.
- Frontend: **12/12** focused tests PASS; `npm run typecheck`, `npm run lint`, `npm run build` all PASS.
- Desktop: **21/21** selected synthetic/metric/Excel contract tests PASS; renderer `node --check` PASS.
- Final summary gate: PASS. Total **76/76 Node tests PASS**. Earlier 18/18 JS pure-module assertions are separate evidence.
- Earlier CI runs failed from invalid `runner.temp` at job env scope and then missing `__esModule` in test mock; both fixed. This successful run supersedes those failures **for the selected gates**.

**Ledger distribution:** **7 PASS**, **7 PARTIAL**, **6 OPEN**. `PASS` means the entry's exact focused command/check met its stated gate on the pinned SHA; `PARTIAL` means only some acceptance checks passed. Never infer production readiness from focused CI.

**Potential external automation:** GitHub check-runs showed a failed Cloudflare `Workers Builds: ktc-be-test` check on earlier commits. GitHub pushes may automatically trigger Cloudflare builds outside this workflow. This run did not intentionally deploy, and it does not prove all external deployment workflows were disabled. Verify those settings before further branch pushes.

**Unresolved release blockers:** D-05 PendingReports DOM/checkbox refactor not done; D-04/D-09/D-17 browser role/UI; D-02/D-15/D-19 full XLSX template roundtrip/sync; D-07 overall release review; D-11/D-13/D-14/D-16/D-18 partial integrated/packaging checks. No isolated DB E2E or Windows physical-device UAT has been performed.

## Deferred batch 1/5 — Manager Pending and Approved (2026-11-19)

**Source refactor done; actual browser acceptance still open.** Manager and Admin Ops Pending reports now render the 14-column table entirely in React; the legacy mutation observer, global capture-phase click interception, checkbox relocation, custom-page-data event and inlined global styles were removed. Each row carries its real report ID and routes to `/report/review` using its report identity. Original React selection state, select-visible, bulk approve/reject, pagination, filters and fallback inline detail for Admin are preserved. Training snapshot percent is prioritized for historical reports.

Changed:
- `frontend/src/pages/manager/Reports.tsx`
- `frontend/src/pages/manager/ManagerReportWorkspaceFix.tsx`
- `frontend/src/pages/manager/ManagerReportWorkspace.css` (new scoped stylesheet)
- `frontend/tests/manager-pending-native-table.contract.test.cjs` (new contract assertions)
- `frontend/tests/manager-approved-native-navigation.contract.test.cjs` (remove obsolete DOM-hack expectation)
- `.github/workflows/phase2-consolidated-safe.yml` (include new Manager test and scoped trigger)

**Passing CI evidence before last snapshot assertion:** run [44504330287](https://github.com/Nan1233/worker-management-system/actions/runs/44504330287), commit `efaa118e1344b14d435cfd060d7d46b904f1550f`: Backend 43/43, Frontend 16/16 including new Manager contract test, Desktop 21/21, typecheck/lint/build PASS, 4/4 jobs success (**80/80 selected Node tests**). Further changes to prioritize immutable training snapshot and add an assertion require the follow-up CI run on the final code SHA.

**D-04 PARTIAL:** source stable-ID navigation and React row handlers are CI-verified; click/keyboard filtering/page changes in a real browser, manager/admin_ops route authorization and visual checks remain to be exercised.

**D-05 PARTIAL:** DOM hack removed in source, checkbox and bulk review selection are contract-checked; runtime browser tests with mocked/isolated backend, full selection/approve/reject and responsive layout still open.

**Deployment safety:** Cloudflare Workers Builds triggers for `ktc-fe-test` and `ktc-be-test` were inspected read-only; both list `branch_includes: ["test"]`, not this refactor branch. No Cloudflare deploy command, merge, database access, or production file write was used.

All other D entries retain their prior states. Next batch should start from D-09/D-16/D-17 and not re-run unrelated already-PASS suites unless impacted by new code.

## Part 10 execution evidence (2026-11-19)

- Verified branch SHA before CI workflow: `bfa9463f1bd303d42af7e69d16e4113c65c7949a`; CI workflow commit: `6c597a176a7a0f97362496fb1e2f48c18b317afe`.
- Real isolated JavaScript execution (GitHub connector-retrieved source, with no Node require/DB/filesystem) tested 18 cases over four **exact current pure modules**: `productionChildTotalsValidation`, `productionDailyHoursCalculation`, `reportEditProposalReadNormalization` and `monthlyWorkbookNaming`. **18/18 PASS** on those function behavior assertions. This is narrower than `node --test` and cannot close D-01 through D-19.
- Added `.github/workflows/phase2-consolidated-safe.yml` to run selected backend/frontend/Desktop tests plus frontend typecheck/lint/build, using only ephemeral GitHub runners and no DB credentials. Push trigger limited to changes to the workflow file on the refactor branch; manual dispatch available. GitHub Actions run-list query immediately after commit returned `0`; **no CI PASS evidence yet**.
- D-05 remains **unfixed** (Manager Pending DOM recreation). D-04/D-09/D-17 need actual browser UI. D-19 needs synthetic XLSX round-trip. D-07 remains overall release gate. Do not convert any of these into PASS without evidence.

## Already verified by source inspection — avoid unnecessary repetition

- Part 9 extracted monthly workbook naming logic byte-for-byte into a dependency-free helper and preserved renderer exports. Added filename and sync contract tests. After GitHub re-fetch, 10/10 static checks passed; **Node/ExcelJS smoke not run**.

- Part 8 invalidates in-flight permission requests with generation fencing and clears `inFlight` on cache invalidation; limits `.module-row td` selectors to `.permission-page`. Added 6 focused Node tests. After GitHub re-fetch, 12/12 static checks passed; **Node/browser tests not run**.

- Part 7 changed locked create-model daily-hours expression to reuse existing pure `incomingDailyWorkHours` (GC/MAI grouping rules and fallback unchanged). Added 10 sample compatibility scenarios plus source guard tests. 12/12 source checks after re-fetch; **Node tests not run**.

- Part 6 extracted the existing `validateChildTotals` function byte-for-byte into a pure module and left submission callsite unchanged. After GitHub re-fetch, 9/9 static checks passed; Node tests **not run**.

- Part 5 extracted proposal list/detail JSON parsing into a read-only helper. Review handler text was byte-for-byte unchanged at edit time; 11/11 static checks after re-fetch. Four behavioral tests of a **manually reconstructed isolated helper copy** passed (not a repository test-run PASS).

- Part 4 moved single-product standard lookup and one-time draft-save warning into hooks without changing submission payload builder. 13/13 static checks after re-fetch; **not Node PASS**.

- Part 2 fixed helper endpoint to `/:id/link-participants` with `temp_machine_line_ids`, unchanged backend `REPORT_APPROVE` permission. 8/8 static source checks at code time; **not Node pass**.
- Part 3 changed approved manager/admin_ops navigation to use React row's report ID directly, eliminated DOM index/refetch/observer from approved route. 8/8 independent static source checks at code time; **not Node/UI pass**.
- Existing worker/lead/admin report detail behavior is retained when no optional `onOpenReport` prop is provided.
- No DB writes, migrations, CI triggers, merges, or production deploys conducted.

## Consolidated final run rules

1. Pin HEAD SHA and clean working tree before executing.
2. Use dedicated isolated env, secrets, DB and synthetic fixtures; avoid broad test commands until individually audited.
3. Run exact focused tests for D-03/D-06, frontend typecheck/lint/build, safe backend tests, and Desktop synthetic Excel parity.
4. Run UI/E2E for D-04/D-05 only when isolated test environment exists.
5. Mark only evidenced PASS results closed. Keep missing/failed checks as explicit blockers; no production merge/deploy on missing gates.
