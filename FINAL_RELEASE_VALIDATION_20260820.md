# KTC Final Release Validation — 2026-08-20

This release hardening wave is local-only. No GitHub Actions workflow is required to modify or validate source.

## 1. Dependencies

From `backend` and `frontend`:

```cmd
npm install --package-lock-only
npm audit
npm ci
```

The project pins the vulnerable transitive `uuid` dependency to `11.1.1` through npm overrides. Do not run `npm audit fix --force`.

## 2. Critical Worker → Manager → Approval → Excel E2E

Use an isolated staging database only:

```cmd
cd /d F:\VSCode\worker-management-system
set LOCAL_BACKEND_URL=http://127.0.0.1:19080
set KTC_ZERO_COST_FIXTURE=validation-artifacts/fixture.json
node scripts/stagingE2E.cjs
```

Or:

```cmd
cd /d F:\VSCode\worker-management-systemackend
npm run e2e:critical
```

The test creates uniquely tagged records and cleans them up by default. Set `KTC_E2E_KEEP_DATA=1` only when forensic inspection is required.

## 3. Large-data performance

Run against a staging/local database containing production-scale data:

```cmd
cd /d F:\VSCode\worker-management-systemackend
set KTC_PERF_MIN_REPORTS=10000
set KTC_PERF_P95_BUDGET_MS=1500
npm run perf:large-data
```

Optional API load:

```cmd
set KTC_PERF_API_BASE=http://127.0.0.1:19080
```

The benchmark is read-only.

## 4. Runtime security

```cmd
cd /d F:\VSCode\worker-management-system
set KTC_SECURITY_API_BASE=http://127.0.0.1:19080
node scripts/runtimeSecurityAudit.cjs
```

Checks security headers, cache policy, unauthenticated API rejection and TRACE handling.

## 5. Production smoke

Use production credentials and read-only DB access only:

```cmd
cd /d F:\VSCode\worker-management-system
set KTC_PROD_API_URL=https://YOUR-RENDER-API
set KTC_E2E_WORKER_CODE=...
set KTC_E2E_MANAGER_USERNAME=...
set KTC_E2E_MANAGER_PASSWORD=...
set DB_HOST=...
set DB_USER=...
set DB_PASSWORD=...
set DB_NAME=...
node scripts/productionSmokeE2E.cjs
```

Production smoke never writes reports, approvals or deletions.
