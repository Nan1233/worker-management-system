# KTC Release Validation

## Dependency audit (non-breaking)

Backend and desktop declare npm overrides for the two moderate findings previously reported by `npm audit` in the ExcelJS dependency tree: `uuid` 11.1.1 and `tmp` 0.2.6.

After pulling this branch, regenerate lockfiles and verify with `npm audit` and `npm ci`. Do not use `npm audit fix --force` for this release.

## Real browser E2E + visual regression

```cmd
cd frontend
npm install
npx playwright install chromium
set KTC_PLAYWRIGHT_START_SERVER=1
npm run e2e
```

Write-path E2E requires an isolated staging environment with `KTC_E2E_WORKER_CODE`, `KTC_E2E_MANAGER_USERNAME`, `KTC_E2E_MANAGER_PASSWORD`, and `KTC_E2E_API_URL`.

## Large-data performance

```cmd
set DB_HOST=...
set DB_USER=...
set DB_PASSWORD=...
set DB_NAME=worker_management_e2e
set DB_PORT=3306
node scripts/performanceLargeData.cjs
```

The benchmark is read-only but **requires the disposable isolated `worker_management_e2e` database**, verified TLS and a successful database guard before any benchmark query. Never run it against production TiDB; configure `DB_HOST`, `DB_USER`, `DB_PASSWORD` and the actual `DB_PORT` for the isolated database only. It records `performance-large-data.json` with PASS/FAIL evidence.

## Runtime security

```cmd
set KTC_RUNTIME_API_URL=https://your-staging-api
node scripts/securityRuntimeAudit.cjs
```

## Final smoke

`finalProductionSmoke.cjs` is intentionally read-only for production. Write-path E2E must target isolated staging.

## Phase 3 source CI and acceptance boundary

Run the **Phase 3 Source Acceptance Evidence** workflow on the exact candidate commit. It includes Windows-runner Excel regression, Linux desktop smoke, frontend/backend tests and audits, and staging safety contracts. A green workflow is source verification only; physical Windows device and isolated TiDB staging UAT must still be recorded in `docs/PHASE3_EXIT_GATE.md`.

The staging gate (`node scripts/stagingReleaseGate.cjs`) writes `validation-artifacts/staging-release-gate.json`; do not run it without verified isolated staging credentials and a loopback API. Never use Cloudflare production/test Worker URLs for write-path E2E.
