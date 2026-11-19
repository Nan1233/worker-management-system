# KTC Phase 2 — Part 5/10: Report edit proposals and approval safety (2026-11-19)

Branch: `refactor/ktc-local-cleanup`; no database writes, schema changes, merge or deploy.

## Source audit

`backend/routes/productionTempRoutes.js` implements proposal list, create, edit, review and delete, with admin/manager/lead role gating and `REPORT_APPROVE`. List/detail apply manager scope using `ProductionTemp.canManageReport`; admin bypass is explicit.

The review endpoint is a critical atomic transaction:
1. Validate request and access.
2. Start read-committed transaction; lock proposal `FOR UPDATE`; reject concurrent/nonpending changes.
3. Reject: transition proposal CAS, commit, then invalidate cache.
4. Approve: strictly validate proposed_data JSON **inside transaction**; call `controller.updateTempReport` with `transactionConnection`; fail closed on legacy machine lines/stale machine refs; optionally approve via `atomicApprovalModel.approveSelected` using same connection.
5. Transition proposal status CAS, commit, invalidate manager list cache and run notifications only after commit. Failure before commit rolls back; release in `finally`.

Existing `backend/tests/proposalReviewTransaction.contract.test.js` asserts source ordering; `proposalReviewRollback.behavior.test.js` extracts and runs the route handler with mocks. Relocating the transaction would break the test harness even if runtime behavior were preserved. Therefore the transaction was deliberately **not moved**.

## Implemented safe refactor

- Added `backend/services/reportEditProposalReadNormalization.js` with `normalizeProposalReadRow(row)`, which preserves previous read semantics: JSON string becomes parsed data, malformed read JSON falls back to `{}`, already parsed data is unchanged, returns the original row.
- Replaced duplicate JSON-decoding blocks in proposal detail and list GET path with this helper.
- **The complete proposal review route handler was verified byte-for-byte identical during the edit.** Strict invalid-data rejection is unaffected.
- Added `backend/tests/report-edit-proposal-read-normalization.test.js` with behavior and integration-contract assertions.

Commits: helper `8ca0006376c3003deb2fb62b5088c78480f50634`; route `788a89c5b61521c0c2b2789f5b70beddb587dd83`; regression test `51475d3ca78c5b631add21206612183dd253295a`.

## Verification evidence and limits

- Re-fetched modified source from GitHub; 11/11 static route/helper/test checks passed.
- Executed `node --check` and `node --test` on an isolated, **manually reconstructed copy** of the pure helper in a temporary local folder. Four helper behavior tests passed.
- The exact GitHub repo test file, preexisting proposal transaction tests, dependency graph, TypeScript frontend, and actual E2E are **not run**. This is *not* a repository green CI claim.

## Deferred follow-up

- D-10: run `cd backend && node --test tests/report-edit-proposal-read-normalization.test.js` on pinned checkout.
- D-11: run `cd backend && node --test tests/proposalReviewRollback.behavior.test.js tests/proposalReviewTransaction.contract.test.js` plus auth/scope checks on isolated fixtures.
- D-01–D-09 remain open as previously documented. At consolidated verification, skip only tests with recorded PASS for unchanged source and commit.
- Transaction decomposition, proposal UI duplication and permission/scope integration require isolated regression coverage before broader refactor; do not mark resolved.

## Acceptance

**Part 5 read-only normalization implemented and locally simulated; full approval/refactor acceptance remains pending D-10/D-11 and full CI baseline.** No production or shared TEST DB contact.
