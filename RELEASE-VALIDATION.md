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
set DB_NAME=...
node scripts/performanceLargeData.cjs
```

The benchmark is read-only and uses production-shaped indexed queries.

## Runtime security

```cmd
set KTC_RUNTIME_API_URL=https://your-staging-api
node scripts/securityRuntimeAudit.cjs
```

## Final smoke

`finalProductionSmoke.cjs` is intentionally read-only for production. Write-path E2E must target isolated staging.
