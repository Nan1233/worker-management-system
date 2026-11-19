# KTC — Giai đoạn 6/10: approved-edit concurrency, rollback and safe CI

Date: 2026-11-19. Branch `refactor/ktc-local-cleanup`. No merge, deploy, production/shared TEST database access or NAS writes.

## Actual implementation

- `backend/tests/approved-edit-preserves-machine-data.test.js`: added two executable tests using a deterministic fake transactional DB and stubbed collaborators.
  - Stale `expectedUpdated_at` against a locked approved report must throw `REPORT_VERSION_CONFLICT` HTTP 409, issue `ROLLBACK`, never `COMMIT`, and produce **zero SQL writes**.
  - After a separate stale attempt, a valid version edit must commit, and approved machine line/defect tables must not be mutated.
- `.github/workflows/phase2-consolidated-safe.yml`: includes this backend test in the isolated backend job and in path triggers, so it is not merely an unexecuted test file.
- Existing `backend/services/approvedReportEditService.js` already locks `production_reports` with `SELECT ... FOR UPDATE` and checks the supplied `expectedUpdatedAt` against the locked current snapshot. No unproven production behavior was changed.

## Findings from earlier Phase 5 browser failure

[Run 44517341120](https://github.com/Nan1233/worker-management-system/actions/runs/44517341120) failed 2/6 Chromium smoke tests because the test expected 23 typed characters from a login field with `maxlength=20`. Four browser tests passed. The incorrect test expectation was corrected in Phase 5; an invalid synthetic token guard was also added. Phase 5 reruns were queued/in-progress during this change set. A green Phase 6 run must be explicitly observed before calling new backend tests PASS.

## Limitations and release gate

This is a **fake DB transactional regression**, not real concurrent transactions on TiDB. It does not prove cross-instance isolation, retry behavior under actual TiDB lock contention, or an authenticated browser editing flow. To close D-11/D-13/D-16, run disposable `ktc_it_*` TiDB fixtures, two independent clients with same `expectedUpdated_at`, an injected failure between child inserts, RBAC process scope and rollback assertions; verify the winning write and losing 409. Ensure an omitted concurrency token is handled by an explicit product policy before release.

D-11/D-13/D-16 stay PARTIAL. D-04/D-05/D-09/D-17 PARTIAL (authenticated browser); D-14/D-15 PARTIAL (real historical physical events); D-18/D-19 PARTIAL (Windows installer/full Excel CAS); D-07 OPEN. Baseline **8 PASS, 11 PARTIAL, 1 OPEN**. Production release **NOT APPROVED**.
