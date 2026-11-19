# KTC — Phase 2 / Part 10 of 10: Consolidated verification and release decision

Date: 2026-11-19. Repository: `Nan1233/worker-management-system`, branch `refactor/ktc-local-cleanup`.

## Executive decision

**NOT RELEASE READY.** All nine prior parts have source-level, reversible edits and recorded static checks. However the exact repository has not completed its Node test, TS/lint/build, Windows/Desktop Excel, browser, DB-isolated E2E and visual acceptance gates. Phase 10's evidence collection and one-time CI workflow have been prepared, but not all tests are executed. Do not merge or deploy.

### Exact environment and limits

- Local executor: Node `v22.16.0`, npm `10.9.2`.
- Direct `git ls-remote https://github.com/Nan1233/worker-management-system.git HEAD` failed with `Could not resolve host: github.com`. Thus no local exact repo checkout or dependency install.
- GitHub source connector can retrieve individual files and create commits but does not provide repo-level test execution or workflow dispatch.
- GitHub Actions run-list query immediately after the workflow commit reported zero runs. No Actions job can be declared successful until job logs and exact SHA are obtained.

## Actual executable checks completed

Four **current GitHub-source pure modules** were retrieved, evaluated in an isolated JavaScript runtime, and tested with direct assertions (no network, DB or file writes). **18/18 passed**:

| Module | Checks |
|---|---|
| `backend/services/productionDailyHoursCalculation.js` | GC parallel-machine maximum, same machine aggregation, MAI machine ID and deductions, nonparallel fallback, zero lines fallback, negative machine net clamp |
| `backend/services/productionChildTotalsValidation.js` | valid NG/deduction details, 70-minute rounding, NG mismatch public 422 code, deduction mismatch public 422 code |
| `backend/services/reportEditProposalReadNormalization.js` | proper JSON read, malformed JSON fallback, already parsed row retention |
| `desktop/electron/monthlyWorkbookNaming.cjs` | ten process mappings, GC naming, month override, summary naming, unsupported process rejected |

These checks execute **real module source**, but do not execute original repository `node --test` files or test integration. They are genuine, limited function checks, not full build/regression evidence.

## One-time automated source gate

Added `.github/workflows/phase2-consolidated-safe.yml` (`6c597a176a7a0f97362496fb1e2f48c18b317afe`):
- backend syntax/source check and the focused pure/mocked report, transaction, queue, and time tests;
- frontend API contract, Manager row callback, Worker hooks, Admin cache-race tests, plus lint/typecheck/build;
- desktop Excel naming, metrics, physical-machine and export contract tests, and renderer syntax;
- final summary with pinned SHA and job outcomes.

`push` trigger is restricted to changes to **this workflow file only** on the refactor branch, to avoid repeated CI runs on every documentation change; `workflow_dispatch` allows one manual run if automatic Actions is unavailable. No DB secrets are supplied, no E2E/remote staging/migration/deploy is invoked, and `npm ci --ignore-scripts` avoids lifecycle writers. Running these tests is still subject to the actual GitHub Actions settings and job results, neither of which is yet verified.

## Outstanding acceptance ledger

The single canonical ledger `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md` now tracks **D-01 through D-20**. All entries remain OPEN unless a pinned checkout run supplies their stated closure evidence.

Priority blockers:
1. **D-01, D-03, D-06, D-08, D-10, D-12, D-14, D-16, D-18, D-20**: capture focused CI/Node build and contract test results.
2. **D-05**: Manager PendingReports still transforms rendered DOM and moves selection checkboxes; source refactor is **not finished**, and bulk review UI regression must precede release.
3. **D-04, D-09, D-17**: browser tests for Manager report navigation, Worker drafts/offline, Admin roles and responsive CSS.
4. **D-02, D-15, D-19**: isolated synthetic XLSX generation, template round-trip, physical event/approved snapshot parity and _KTC_SYNC metadata.
5. **D-07, D-11, D-13**: integration-level safety (permissions, CAS, transaction rollback, duplicate/idempotent submissions) on an **isolated** DB/fixtures.

## Criteria to close Phase 2

- A pinned SHA and successful or appropriately triaged one-time focused test logs, typecheck, lint and build.
- Fix any failures and re-run only affected checks.
- Replace PendingReports global DOM manipulation with React-owned layout or explicitly risk-accept with repeatable UI regression.
- Confirm browser interactions for all relevant roles and responsive layouts, and synthetic XLSX sample parity (formulas/styles/column/sheet/metadata) without writing real company folders.
- Validate only against a disposable database if DB integration is authorized, never shared TEST/production TiDB.
- All D-01 through D-20 closed with evidence, or explicit documented acceptance of each remaining risk.
- Only after those conditions: separate approval for merge/deploy.

## Source changes and traceability

Previous phase reports `docs/PHASE2_PART2_*.md` through `docs/PHASE2_PART9_*.md` document individual commits and exceptions. No Phase 10 production code change was required for the pure checks; it added CI and documentation.

**Current classification: Phase 2 parts 1–9 source work performed, Part 10 acceptance pending. No production changes.**
