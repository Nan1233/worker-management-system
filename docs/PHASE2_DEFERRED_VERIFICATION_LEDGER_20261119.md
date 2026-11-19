# KTC — Phase 2 deferred verification ledger (2026-11-19)

This ledger must be repeated in each chat progress report until closure and used for **one consolidated regression pass** at the end of Phase 2. Do not re-run checks that already have verifiable PASS evidence on the *same commit*; if affected files change, revalidate impacted checks.

| ID | Origin | Pending / blocked | Closure evidence | State |
|---|---|---|---|---|
| D-01 | Part 1 | GitHub Actions isolated checkout: Backend check, Frontend typecheck/lint/build completed at pinned source SHA | Recorded 4/4 successful jobs at run 44511311244 | PASS |
| D-02 | Part 1 | Safe isolated focused Node suites and Desktop synthetic worker Excel smoke executed with temp fixtures and no shared DB | GitHub Actions 44509214418: Backend/Frontend/Desktop selected suites and scripts/smokeExcel.cjs PASS; no production data | PASS |
| D-03 | Part 2 | Machine-event participant API Node contract and frontend TypeScript check passed in isolated CI | Focused Node contract and typecheck PASS on pinned SHA | PASS |
| D-04 | Part 3 | Manager approved-row navigation React/UI regression (click, keyboard, filtering, pagination, admin_ops path) | Browser/component test evidence on isolated checkout | PARTIAL |
| D-05 | Part 3 | React-owned Pending table refactor completed; interactive browser selection, bulk approve/reject and responsive visual regression remain | Browser tests with fixture data prove checkbox, select all, filter, pagination, bulk approve/reject and layout | PARTIAL |
| D-06 | Part 3 | Manager approved navigation contract Node test | `node --test frontend/tests/manager-approved-native-navigation.contract.test.cjs` pass | PASS |
| D-07 | Cross-phase | Full permissions/transaction/shared-machine/Excel and end-to-end release gates | Consolidated run on isolated test DB and synthetic Excel, separately approved | OPEN |
| D-08 | Part 4 | Worker form hook simulation test and frontend typecheck | `node --test frontend/tests/f02-process-form-extracted-hooks.test.cjs` and typecheck PASS with pinned commit | PASS |
| D-09 | Part 4 | Worker submit/draft/offline test suite PASS; actual browser submission/draft and offline synchronization still unverified | Browser integration with mocked/isolated API proves unchanged payload, draft recovery, single-click submit, offline retry and identity isolation | PARTIAL |
| D-10 | Part 5 | Repository Node test for shared proposal read normalization | `cd backend && node --test tests/report-edit-proposal-read-normalization.test.js` with exact checkout SHA | PASS |
| D-11 | Part 5 | Proposal rollback, transaction-order and approved-edit concurrency mock tests PASS; real DB scope and concurrent approval isolation not tested | Isolated database integration tests confirm rollback/commit and RBAC for different actors | PARTIAL |
| D-12 | Part 6 | Execute child NG/deduction total validator tests and backend source checks on isolated checkout | `cd backend && node --test tests/production-child-totals-validation.test.js && npm run check` PASS with pinned SHA | PASS |
| D-13 | Part 6 | Mocked logical-duplicate/locked-submit/queue and multi-machine tests PASS; real concurrent transaction + idempotency DB fixture pending | Disposable DB concurrent create/submission tests and rollback evidence | PARTIAL |
| D-14 | Part 7 | Historical effective dates, missing snapshot fail-closed, daily-hours parity and physical event tests PASS on CI; TiDB isolation/snapshot migration parity still untested | Disposable DB historical standards and immutable snapshots checked across approval lifecycle | PARTIAL |
| D-15 | Part 7 | Backend/Desktop historical KPI and shared machine event fixture parity PASS in CI; approved-data DB + generated XLSX roundtrip parity not tested | Synthetic approved report fixture compared through backend, Desktop XLSX and immutable event/version snapshots | PARTIAL |
| D-16 | Part 8 | Execute permission cache stale-response race tests, TS typecheck, permissions and Master Control regression on pinned checkout | `cd frontend && node --test tests/permission-cache-invalidation-race.test.cjs && npm run typecheck`; independently verify backend 403 on unauthorized roles with isolated fixtures | PARTIAL |
| D-17 | Part 8 | Permission matrix CSS/visual responsive checks, dark theme and admin user/role override interactions | CSS contract test plus browser visual and role matrix interaction evidence at desktop/mobile widths | PARTIAL |
| D-18 | Part 9 | Desktop workbook naming, renderer syntax, packaging-sync tests and packaged shared contract checks PASS; full Electron/Windows package not built | Windows isolated NSIS/portable packaging, signing and device smoke evidence | PARTIAL |
| D-19 | Part 9 | Six Workbook1 + K1/K2 paper-form actualTime edits and CVK OK edit parse correctly via _KTC_SYNC row/ID; multi-date and identity mismatch tested; all 11 XLSX export PASS | Remaining: all editable fields and detail columns, legacy/modified paper imports, GUI preview, server-side CAS and end-to-end DB synchronization on disposable environment | PARTIAL |
| D-20 | Part 10 | Consolidated isolated CI run 44511311244 PASS all four jobs (292/292 selected Node tests) | GitHub run pinned to source SHA 356e6052e6e8ca8742049e945fd5ace68005fa06 | PASS |

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

**Final CI evidence (newest code-bearing SHA):** run [44504790741](https://github.com/Nan1233/worker-management-system/actions/runs/44504790741), source commit `7ea510032d8e7428e422b39d47cb4dc65d25a830`: **4/4 jobs SUCCESS**, Backend 43/43, Frontend 16/16, Desktop 21/21 (**80/80 focused Node tests**), frontend typecheck/lint/build PASS. Source changes after this run were documentation-only and did not alter application/test code.

**Passing CI evidence before last snapshot assertion:** run [44504330287](https://github.com/Nan1233/worker-management-system/actions/runs/44504330287), commit `efaa118e1344b14d435cfd060d7d46b904f1550f`: Backend 43/43, Frontend 16/16 including new Manager contract test, Desktop 21/21, typecheck/lint/build PASS, 4/4 jobs success (**80/80 selected Node tests**). Further changes to prioritize immutable training snapshot and add an assertion require the follow-up CI run on the final code SHA.

**D-04 PARTIAL:** source stable-ID navigation and React row handlers are CI-verified; click/keyboard filtering/page changes in a real browser, manager/admin_ops route authorization and visual checks remain to be exercised.

**D-05 PARTIAL:** DOM hack removed in source, checkbox and bulk review selection are contract-checked; runtime browser tests with mocked/isolated backend, full selection/approve/reject and responsive layout still open.

**Deployment safety:** Cloudflare Workers Builds triggers for `ktc-fe-test` and `ktc-be-test` were inspected read-only; both list `branch_includes: ["test"]`, not this refactor branch. No Cloudflare deploy command, merge, database access, or production file write was used.

All other D entries retain their prior states. Next batch should start from D-09/D-16/D-17 and not re-run unrelated already-PASS suites unless impacted by new code.

## Deferred batch 5/5 — Final code fix, focused acceptance and release decision (2026-11-19)

**Latest verified isolated CI [44511311244](https://github.com/Nan1233/worker-management-system/actions/runs/44511311244)**: source SHA `356e6052e6e8ca8742049e945fd5ace68005fa06`, **4/4 jobs SUCCESS**, **292/292 Node tests PASS** (Backend 162, Frontend 73, Desktop 57), frontend TypeScript/lint/build PASS, worker Excel synthetic smoke and packaged-contract read-only checks PASS. Earlier failures on new Workbook1 tests exposed a **real GC false-update bug**; this was fixed and re-tested green, not skipped.

**Workbook1 ID-safe two-way editing source repair:**
- `desktop/electron/monthlyWorkbookLocal.cjs` writes report ID, source data row, worker code, work date and day STT to veryHidden `_KTC_SYNC` for paper templates without an ID column; metadata refers to the *actual visible original sheet*, not the generic process sheet. Row assignment uses the same stable sort and date-separator policy as workbook output, in linear time. The six Workbook1 paper forms and older K1/K2 templates are supported without altering the printable sheet.
- `desktop/electron/excelDbSync.cjs` resolves report rows by the saved hidden identity, validates row/worker/day/STT before producing any patch, preserves `expected_updated_at`, refuses old files missing safe mappings and rejects unmatched manually added paper rows. For paper exports it only proposes changes to fields actually mapped by that paper form. The GC helper no longer creates a phantom `operation_type: null` update if the helper has no typed operation value.
- `desktop/tests/phase2-batch4-xlsx-isolated-roundtrip.test.cjs` now executes actual XLSX output/edit/import (not only source assertions) for all six Workbook1 forms, K1/K2, generic CVK; tests multiple dates, intact IDs, concurrency token, zero-update unedited file and worker-code tampering fail-closed.

**Closure classification remains evidence-based: 8 PASS, 11 PARTIAL, 1 OPEN (D-07).** D-19 materially progressed but remains PARTIAL: not every mutable deduction/defect/detail field and unsupported legacy paper file was exercised, nor has a disposable TiDB server applied/rejected actual incoming patches. The veryHidden worksheet is a mapping aid, **not a security boundary**; backend RBAC/expected_updated_at must remain authoritative.

**Cannot accept production release:** D-04/D-05/D-09/D-17 interactive browser and responsive visual UAT; D-11/D-13/D-14/D-15/D-16 disposable TiDB permission/concurrency/rollback/snapshot verification; D-18 Windows install/signing/device; D-19 full Excel edit/import/CAS and manual-blank-row UX; D-07 cross-system sign-off. No merge, manual deploy or write to production/shared TEST DB/NAS occurred.

Five deferred batches of source and safe automated verification are done. **Final Phase 2 release approval: NOT APPROVED** until remaining gates pass or each risk is explicitly accepted by an authorized owner. New fixes must rerun affected tests.

## Deferred batch 4/5 — Desktop XLSX export, sync and packaging (2026-11-19)

**CI run [44509214418](https://github.com/Nan1233/worker-management-system/actions/runs/44509214418)**, pinned app/test SHA `0039c960c758a36e711dea2b5ffd10f9481ecd44`: **4/4 jobs SUCCESS**; **280/280 selected Node tests PASS** (Backend 162, Frontend 73, Desktop 45); frontend typecheck, lint and build PASS. Desktop's separate worker Excel smoke and packaged shared contract script also PASS.

New `desktop/tests/phase2-batch4-xlsx-isolated-roundtrip.test.cjs`: generated a real summary workbook plus all 10 process XLSX buffers from synthetic approved fixtures, wrote these under a unique `os.tmpdir()` directory (never KTC Documents/NAS), reloaded each workbook, validated visible sheets, file suffix/prefix, `_KTC_SYNC` veryHidden contract/version/month/process, original report IDs and timestamps. Tested generic CVK import: changed OK in the actual temporary XLSX file and read it via `readExcelChanges`; expected a report patch with `tt_ok=91` and original `expected_updated_at`, no DB request. Existing six Workbook1 and MAI/DO original template tests preserve formulas, styled cells, coded NG, date rows and source-specific formats. Packaging-sync and packaged shared contract checks passed.

- **D-02 PASS**: focused safe isolated unit suites + actual worker Excel synthetic smoke executed, no shared DB or production file write.
- **D-18 PARTIAL**: naming and source packaging checks passed; Windows NSIS/portable build, signing and installed-device validation not performed.
- **D-19 PARTIAL (was OPEN)**: actual XLSX buffer/file roundtrip for all 11 files and edited CVK import passed. **Important unresolved risk**: `WORKBOOK1_FORMS` mappings are paper-form columns without a visible `id`, while `readExcelChanges` currently requires an `id` column to associate rows. End-to-end edited Workbook1 report sync for the six processes has **not** been verified, so do not imply that the full two-way sync is safe. Dedicated row identity mapping, conflict checks and import regression are required before release.
- The general folder validator `scripts/validateExcelFolder.cjs` assumes a common header/freeze contract that differs from user-approved Workbook1 paper templates; no production folder validation was attempted. Review its applicability to the two template families before using it as a release gate.

All other D entries preserve their previous statuses. **Overall ledger: 8 PASS, 11 PARTIAL, 1 OPEN (D-07).** Next batch 5/5 must not mark the project release ready unless browser, DB-isolated, Excel import identity and Windows packaging blockers receive evidence or explicit risk acceptance.

## Deferred batch 3/5 — Backend and historical KPI (2026-11-19)

**CI source SHA `73aa3db7b4f8cb45abc4a438357c8030382fbff3`**: [GitHub Actions 44507431486](https://github.com/Nan1233/worker-management-system/actions/runs/44507431486) = **4/4 jobs SUCCESS**. Backend **162/162** focused/mocked tests, Frontend **73/73**, Desktop **21/21**, total **256/256 PASS**; frontend typecheck, lint and build PASS. No DB credentials provided, no production write or deployment.

Added `backend/tests/phase2-batch3-historical-kpi-parity.test.js` (5 new tests) protecting immutable historical training percent, approved DB fields, missing-training fail-closed, single physical event across multiple workers and no fallback for missing physical event. Extended isolated CI to execute transaction rollback and ordering, approved-edit concurrency, logical duplicates and submission locking, historical standards, approved version snapshots, GC shared-machine accounting, and Backend/Desktop shared metric primitives. Fixed two outdated **test harnesses**, not runtime business logic: machine-copy helper extraction boundary and the create-model daily-hours delegation contract.

- **D-11 PARTIAL:** mocked transaction review/rollback/ordering and edit concurrency PASS. Real permission scope, DB locking and rollback still untested.
- **D-13 PARTIAL:** mock concurrency, duplicate and submission queue PASS; no disposable TiDB concurrent writes tested.
- **D-14 PARTIAL:** historical effective-date/snapshot and shared accounting suites PASS; no real approved data migration/DB parity.
- **D-15 PARTIAL (was OPEN):** historical KPI Backend/Desktop fixture tests PASS; missing approved-data/Excel workbook round-trip and machine totals tied to real database snapshots (requires D-19).

All other D-01 to D-20 statuses unchanged. **Overall: 7 PASS, 11 PARTIAL, 2 OPEN**. Do not mark D-11/D-13/D-14/D-15 as full PASS until corresponding isolated DB and XLSX/browser acceptance evidence exists.

## Deferred batch 2/5 — Worker and Admin (2026-11-19)

**One-time focused CI run:** [44506347025](https://github.com/Nan1233/worker-management-system/actions/runs/44506347025), source SHA `a48134f4143a537329196d09e1efd0724373fe1e`. **4/4 jobs SUCCESS**, **137/137 Node tests PASS** (Backend 43, Frontend 73, Desktop 21), Frontend TypeScript typecheck, lint and build PASS.

Actual changes:
- `frontend/src/security/permissions.ts`: an in-flight permission response also fails closed if the signed-in user changes, preventing old-account rights from being returned or cached.
- `frontend/tests/permission-cache-invalidation-race.test.cjs`: added race test for account identity change.
- `frontend/src/pages/admin/Permissions.css`: added scoped `[data-theme="dark"]` palette and narrow viewport overflow safeguards. A follow-up CSS selector fix preserved two legacy `.module-row td` selectors exactly.
- `frontend/tests/admin-permission-responsive.contract.test.cjs`: asserts dark mode, responsive and Master Control backend guard contracts.
- `.github/workflows/phase2-consolidated-safe.yml`: extended focused no-DB test matrix with existing Worker draft, offline queue, split submission, Master Control and permission suites.

D-09 **PARTIAL**: actual Node tests for worker draft persistence, quota failure, owner isolation, atomic offline queue, split-report submission resume and one-click submit passed; full browser worker flow, offline/online transition with API interception and UI state still open.

D-16 **PARTIAL**: test checks confirm backend `role('admin')`, DB-backed `is_super_admin`, 403 guard and client permission cache race; user-account login/denial tests in isolated browser/API environment not run. Do not call actual role denial PASS.

D-17 **PARTIAL**: scoped dark mode and mobile CSS implemented, CSS/structural contracts PASS; browser screenshot comparison at desktop/mobile/light/dark not run. No actual visual acceptance.

The other D-01..D-20 states remain unchanged. Next batch 3/5 covers D-11/D-13/D-14/D-15.

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
