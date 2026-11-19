# KTC remediation — Part 1/3: Backend, TiDB, integrity

Date 2026-11-19; branch `refactor/ktc-local-cleanup`; no production or shared TEST DB access, no merge/deploy.

## Executed in source

1. Rechecked the latest GitHub Actions queue: prior phases 6–8 cancelled, phase 9 and 10 not confirmed green. Do not treat pending runs as passing.
2. Added `backend/tests/approved-edit-concurrency.test.js` regression that submits two edits to the same report with the same original version. The first updates a simulated record, the second must reject `REPORT_VERSION_CONFLICT` (409), and the simulated write log must contain only the first edit.
3. Added bounded deadlock retry regression. The production guard retries lock errors up to four attempts with 250/600/1200 ms delays; tests enforce bounded behavior.
4. Updated the consolidated workflow push path filters so changes to `approved-edit-concurrency.test.js` trigger Backend CI. Existing Backend test command already includes the test.
5. Prior mock service test in `approved-edit-preserves-machine-data.test.js` already checks `SELECT ... FOR UPDATE`, 409, ROLLBACK, zero SQL writes and subsequent successful edit.

## Evidence limits and acceptance blockers

The newly added tests are **in-process simulations**, not true concurrent TiDB transactions. No disposable TiDB credentials/environment were supplied, so **D-11, D-13, D-14, D-15 and D-16 remain PARTIAL**. They require a disposable seeded TiDB instance, independent connections/API processes, real role actors, simultaneous transactions, DB before/after assertions, historical effective-date/snapshot tests and shared physical-machine output/KPI parity. Do not execute against production or shared TEST database.

No test result for this new source SHA has yet been confirmed. Source-level work alone does not close these gates.

### Required isolated DB acceptance matrix

- D-11: two independent DB sessions editing the same approved report with stale `expected_updated_at`; exactly one commit, one 409, no lost NG/machine child data; force validation failure and verify transaction rollback.
- D-13: concurrent identical worker submissions and machine events; exactly-once persistence, no duplicate production rows, proper idempotency and retry.
- D-14: backdated approved report, overlapping/absent standard effective periods, immutable `standard_version_id` and training snapshot after master edits.
- D-15: two workers on one physical event: count machine OK/NG/output/hours once, worker credits separately; compare DB, Backend KPI and exported XLSX.
- D-16: admin, manager scoped/unscoped, lead and worker requests; assert server 403 and zero writes for unauthorized actions, including stale permission-cache scenarios.

## Status

Overall release ledger unchanged: **8 PASS / 11 PARTIAL / 1 OPEN (D-07)**. Part 1/3 is **not accepted as completed E2E**. Production release remains **NO-GO**.
