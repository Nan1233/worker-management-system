# KTC — Giai đoạn 7/10: historical KPI and shared-machine regression

Date: 2026-11-19. Branch `refactor/ktc-local-cleanup`. No merge, deploy or production/shared TEST DB/NAS writes.

## Implemented

Extended `backend/tests/phase2-batch3-historical-kpi-parity.test.js` with four executable Node test cases:

1. A stored approved report's `standard_output=19.875`, `standard_version_id=118` and `training_percent_snapshot=62.25` remain authoritative in Backend and Desktop KPI calculations even if the employee's current training profile and current machine/product standard are changed. Compare adjusted output, standard, planned output, SP/h, achievement and NG rate.
2. Two worker lines linked to one approved physical event with an identical 0.5h machine deduction count exactly 8 gross hours, 0.5 deducted hours and 7.5 net hours; worker-level 5h deductions do not override physical deductions.
3. Two distinct events (8h and 6h) count 14h total even if a participant line for one event is duplicated; physical deductions are also deduplicated per event.
4. A missing linked event among existing linked events yields explicit `MACHINE_EVENT_PARTIAL` and never fabricates 99h from worker credit lines.

Existing regression also checks a fully missing physical event fails closed and missing training snapshot does not fall back to the current employee profile.

## Evidence and release decision

Source commit: `aff3c846adddf02cd869ffccb48b535e2c4eae78`. The consolidated workflow path filter already includes this test file, so push should trigger its Backend CI job. GitHub Actions has an existing queued/in-progress backlog; **do not claim Phase 7 test PASS until the corresponding source SHA run completes**. Check [workflow runs](https://github.com/Nan1233/worker-management-system/actions?query=branch%3Arefactor%2Fktc-local-cleanup).

D-14 and D-15 remain PARTIAL: pure engine/fake-event tests are not approved-record data parity across disposable TiDB, actual Excel export and physical machine event storage. D-11/D-13/D-16 remain PARTIAL until real concurrency/rollback/RBAC DB E2E. D-04/D-05/D-09/D-17 remain PARTIAL for authenticated browser tests. D-18/D-19 remain PARTIAL for Windows installed-app and complete Excel import/CAS. D-07 OPEN. Ledger **8 PASS, 11 PARTIAL, 1 OPEN**; production release NOT APPROVED.
