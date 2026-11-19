# KTC — Phase 2 Part 7/10: Historical standards, training snapshot, KPI and shared-machine parity

Date: 2026-11-19. Repository `Nan1233/worker-management-system`, branch `refactor/ktc-local-cleanup`.

## Source audit

- `backend/services/standardResolutionService.js` rejects overlapping historical effective-date versions (`STANDARD_EFFECTIVE_RANGE_CONFLICT`) and inconsistent stored snapshots (`STANDARD_SNAPSHOT_MISMATCH`).
- `backend/services/trainingSnapshotService.js` reads immutable per-report training percent; missing stored snapshots fail closed (`TRAINING_SNAPSHOT_MISSING`). It preserves same-connection transactional reads for report creation.
- `backend/services/giaCongMachineAccounting.js` delegates physical event hours accounting and uses a `seenEvents` set to avoid double counting machine events; worker credit and physical machine deductions remain separate.
- `backend/services/productionDailyHoursCalculation.js` already defines a pure `incomingDailyWorkHours`: for GC or MAI, sum net time by normalized machine and choose the maximum; for other processes or no lines, fall back to `actual_time`.
- `backend/models/productionTempCreateModel.js` duplicated the same GC/MAI calculation inside `enforceDailyHoursLocked`, risking divergence. This policy is controlled by `DAILY_HOURS_ENFORCEMENT_ENABLED`.

## Implemented change

- Updated `backend/models/productionTempCreateModel.js` to import `incomingDailyWorkHours` and call it after locking the worker row and resolving process code, replacing the duplicate inline loop.
- Did not alter worker locking, feature flag, the daily 12-hour policy, transactions, snapshots, standards, training, physical-machine events, source data or schema.
- Added `backend/tests/production-daily-hours-parity-refactor.test.js`: 10 parity scenarios against a standalone pre-refactor reference calculation (GC split machines, same machine/product rows, MAI parallel rows, deduction fallback, negative net time, missing machine, non-GC fallback, no lines, null values, case/whitespace), and two guard tests for lock/order and historical/physical accounting source invariants.

## GitHub commits

- Refactor: `79a7e9fe3d245a65bcd64a6926092d364f6efa10`
- Test added: `2b937ab21f005f37930b53986f2264ac7d2a1102`

## Evidence

Re-fetched modified and protected source files. Verified 12/12 static checks: shared import/call, no duplicate map, lock happens before calculation, skip policy guard, 12-hour limit error, pure helper, historical effective-date failure, historical snapshot failure, training snapshot failure, physical event dedup, regression cases present.

**Node tests were not run.** Static check 12/12 does not establish runtime parity or release readiness.

To validate on a pinned, isolated checkout:

```bash
cd backend
node --test tests/production-daily-hours-parity-refactor.test.js
npm run check
```

Additionally, run reviewed training snapshot, historical standard version and shared physical-machine accounting tests with synthetic fixtures. For cross-module reporting parity, use an isolated DB and synthetic Excel outputs only. Never write shared TEST/production DB.

## Unresolved / consolidated verification ledger

All prior D-01–D-13 remain OPEN. New items:
- D-14: run actual parity and historical/training/shared-machine regression tests.
- D-15: cross-module physical production and historical KPI parity against synthetic baseline.

See `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md`. Repeat unresolved IDs in progress updates, avoid re-running already evidenced PASS for unchanged commit, and rerun affected tests on code changes.

## Decision

**Part 7 change implemented and source-verified. Runtime/DB/Excel parity not accepted yet.** No merge, deploy, migration or database operation.
