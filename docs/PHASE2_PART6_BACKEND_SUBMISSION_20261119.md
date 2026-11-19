# KTC — Phase 2 Part 6/10: Production submission validation refactor

Date: 2026-11-19  
Repository: `Nan1233/worker-management-system`; branch `refactor/ktc-local-cleanup`  
Status: **Code implemented and statically verified; runtime gate open.**

## Source investigation

- `backend/services/productionTempSubmissionService.js` coordinates idempotent report submission, serial submission queue, logical duplicate prevention, machine-line grouping, transactional inserts and audit.
- `backend/models/productionTempCreateModel.js` owns DB writes and shared-machine transaction locks.
- `backend/models/productionTempApprovalModel.js` owns approval and snapshot/physical-line verification.
- `backend/services/machineLineValidationService.js` already supports injected query functions and lazy DB access.
- The submission service contained a pure `validateChildTotals` function comparing the child report's NG and deduction details against aggregate numbers. No database dependency is required for this check.

## Actual changes

1. Created `backend/services/productionChildTotalsValidation.js`. Extracted `validateChildTotals` byte-for-byte from the submission service. Preserved exact error codes, public 422 payload details, minutes rounding, and 1-minute tolerance.
2. Updated `backend/services/productionTempSubmissionService.js` to import the extracted validator, replacing the inline function. Preserved every existing validator callsite and all transaction handling.
3. Created `backend/tests/production-child-totals-validation.test.js` with six tests: valid totals, rounded 70-minute deduction, NG mismatch, deduction mismatch, negative-value compatibility, and import/callsite contract.

### Commits

- `ba2eeabd7763ea06a7c883d83fbfd0a1489cd08c` extracted pure module
- `493e51cc14d9e79ee16f705c8cd2da6b24031071` changed submission service import
- `89ce8d381d6fbd1713d9052e466bcef78544402d` added regression test

## Static verification

Re-fetched changed files from GitHub and independently checked 9 invariants: 9/9 true. In particular both error codes remain, tolerance remains, no DB import exists in the helper and the original inline function is gone while its callsite remains.

**Not run:** Actual Node test, backend `npm run check`, submission integration, concurrent submit, idempotency and rollback. GitHub checkout from execution container failed due to inability to resolve `github.com`; a GitHub file connector is available but cannot run repo code. No claims of actual regression PASS are made.

## Exact commands to close the gate

In an isolated checkout at pinned HEAD:

```bash
cd backend
node --test tests/production-child-totals-validation.test.js
npm run check
```

Then run the individually reviewed submission-queue/idempotency and rollback regression tests with synthetic fixtures and no shared TEST/production DB.

## Deferred items

All previous unresolved D-01–D-11 remain open. Added:
- D-12: run actual validator test and backend source check
- D-13: verify idempotency, concurrency, split machine submissions and rollback

All items are in `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md`. Do not needlessly repeat evidence-backed PASS on unchanged code at consolidated verification; re-run checks impacted by later changes.

## Acceptance decision

Part 6 minimal-source refactor: **implemented**. Part 6 full runtime acceptance: **not yet verified**. No schema migration, release, merge, deployment or database write.
