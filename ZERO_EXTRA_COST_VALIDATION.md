# KTC Zero-Extra-Cost Validation

## Purpose
Run the maximum release validation without creating or upgrading Render/TiDB resources and without mutating production.

## Execution authority
- Disposable runtime: GitHub Actions MySQL 8 service container (`worker_management_staging_local`).
- Production: no mutation, no load testing, no test reports.
- Workflow is `workflow_dispatch` only; it does not auto-run on push/schedule.

## Workflow
`.github/workflows/zero-cost-validation.yml`

The job performs:
1. `npm ci` from the existing lockfiles.
2. Creates an isolated MySQL DB/user.
3. `db:release -> db:schema:verify -> db:release`.
4. Seeds synthetic E2E identities/master fixtures only.
5. Runs backend + targeted security regression.
6. Starts backend and requires `/api/health/ready`.
7. Runs frontend check/build.
8. Executes the 23-case local Critical E2E runner.
9. Executes controlled 10/25/50/100-user read load and captures p50/p95/p99/max/error count.
10. Captures DB `EXPLAIN` output for representative expensive paths.
11. Runs real Desktop Excel smoke/sync checks with installed ExcelJS.
12. Creates/verifies a local backup and performs a staged restore rehearsal into a new local DB.
13. Uploads `validation-artifacts/`.

## Runners
- `scripts/zero-cost/seed-ci.cjs`: synthetic local fixture seed.
- `scripts/zero-cost/critical-e2e.cjs`: 23-case HTTP E2E.
- `scripts/zero-cost/security-runner.cjs`: focused auth/authz/security regression.
- `scripts/zero-cost/perf-load-runner.cjs`: controlled latency/load measurements.
- `scripts/zero-cost/db-explain-runner.cjs`: query plan evidence.
- `scripts/zero-cost/excel-runtime-runner.cjs`: ExcelJS-backed desktop runtime checks.
- `scripts/zero-cost/collect-report.cjs`: artifact summary.

## Safety invariants
The seed runner refuses to run unless all are true:
- `KTC_RUNTIME_ENV_CLASS=STAGING`
- `DB_HOST` is `127.0.0.1` or `localhost`
- `DB_NAME=worker_management_staging_local`

External integrations are OFF in CI. The workflow contains no production Render/TiDB credential or URL.

## Result classes
- `LOCAL_RUNTIME_PASS`: disposable MySQL runtime passes.
- `CI_RUNTIME_PASS`: full GitHub Actions job passes.
- `PRODUCTION_READ_ONLY_PASS`: only after separate safe GET-only observation evidence exists.
- `INFRA_RUNTIME_PENDING`: TiDB/Render-specific runtime behavior not yet proven.

Local MySQL success never implies TiDB/Render runtime PASS.
