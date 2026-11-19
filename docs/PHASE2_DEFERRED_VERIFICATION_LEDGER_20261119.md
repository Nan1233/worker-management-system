# KTC — Phase 2 deferred verification ledger (2026-11-19)

This ledger must be repeated in each chat progress report until closure and used for **one consolidated regression pass** at the end of Phase 2. Do not re-run checks that already have verifiable PASS evidence on the *same commit*; if affected files change, revalidate impacted checks.

| ID | Origin | Pending / blocked | Closure evidence | State |
|---|---|---|---|---|
| D-01 | Part 1 | Isolated repository checkout and exact SHA baseline; frontend lint/typecheck/build; backend check | Recorded command output and exit codes on a clean isolated checkout | OPEN |
| D-02 | Part 1 | Safe isolated unit suites and Desktop synthetic Excel smoke; no shared TEST/production DB | Test runner logs, fixture isolation, no DB writes | OPEN |
| D-03 | Part 2 | Machine-event participant API Node contract test and TypeScript check, currently static-only | `node --test frontend/tests/machine-event-participant-api.contract.test.cjs`, typecheck pass | OPEN |
| D-04 | Part 3 | Manager approved-row navigation React/UI regression (click, keyboard, filtering, pagination, admin_ops path) | Browser/component test evidence on isolated checkout | OPEN |
| D-05 | Part 3 | Manager pending table wrapper still manually rebuilds DOM/moves checkboxes, uses global click capture/MutationObserver | Refactor to React-owned rendering and verify selection, bulk approve/reject, stable visual layout | OPEN |
| D-06 | Part 3 | Manager approved navigation contract Node test | `node --test frontend/tests/manager-approved-native-navigation.contract.test.cjs` pass | OPEN |
| D-07 | Cross-phase | Full permissions/transaction/shared-machine/Excel and end-to-end release gates | Consolidated run on isolated test DB and synthetic Excel, separately approved | OPEN |
| D-08 | Part 4 | Worker form hook simulation test and frontend typecheck | `node --test frontend/tests/f02-process-form-extracted-hooks.test.cjs` and typecheck PASS with pinned commit | OPEN |
| D-09 | Part 4 | Worker submit/draft/offline/browser regression after extraction | Isolated browser integration test verifying unchanged payload, draft save warnings and standard lookup behavior | OPEN |
| D-10 | Part 5 | Repository Node test for shared proposal read normalization | `cd backend && node --test tests/report-edit-proposal-read-normalization.test.js` with exact checkout SHA | OPEN |
| D-11 | Part 5 | Proposal review rollback/concurrency/scope behavior under isolated fixtures | Run `proposalReviewRollback.behavior.test.js`, `proposalReviewTransaction.contract.test.js` and permission tests; verify no DB writes | OPEN |
| D-12 | Part 6 | Execute child NG/deduction total validator tests and backend source checks on isolated checkout | `cd backend && node --test tests/production-child-totals-validation.test.js && npm run check` PASS with pinned SHA | OPEN |
| D-13 | Part 6 | Verify submission idempotency, concurrent submissions, split machine lines and rollback against isolated fixtures | Backend regression/behavior tests, no shared TEST/production DB; record outcomes | OPEN |
| D-14 | Part 7 | Execute daily-hours parity and frozen historical snapshot/physical-machine tests on pinned checkout | `cd backend && node --test tests/production-daily-hours-parity-refactor.test.js`, reviewed historical/training/shared accounting suites and check command PASS | OPEN |
| D-15 | Part 7 | Validate end-to-end physical machine output counted once and snapshot historical KPIs unchanged after refactor | Isolated fixture parity across backend + desktop; approved snapshot check, no shared DB | OPEN |

## Already verified by source inspection — avoid unnecessary repetition

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
