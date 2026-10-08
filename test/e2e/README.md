# E2E suite

```
npm run test:e2e:excel     # GC 04_CAT_LONG export (no infra needed)
npm run test:e2e:desktop   # desktop on plain Node (no Electron)
npm run test:e2e:api       # real backend over HTTP
npm run test:e2e:db        # API/UI -> BE -> DB, verified back in the DB
npm run test:e2e:web       # Playwright (Vite dev server + Chromium)
npm run test:full          # all layers, sequentially
```

Results: `PASS`, `FAIL`, `SKIP` (always with a reason) per test, then totals and a
FE / BE / DB / EXCEL / DESKTOP table. A missing environment makes tests SKIP, never
PASS; only FAIL makes the exit code non-zero. Artifacts (masked logs, payloads, API
responses, DB read-backs, xlsx output, screenshots) go to `test-results/e2e-results/`
(git-ignored).

## Environment

| Variable | Used for |
|---|---|
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME=worker_management_e2e` | DB layer and every write test. Checked by `backend/scripts/e2e-db-guard.cjs`; any other `DB_NAME` is refused. (`worker_management_staging_local` is accepted only on localhost with `KTC_RUNTIME_ENV_CLASS=STAGING`, as prepared by `scripts/zero-cost/seed-ci.cjs`.) |
| `KTC_ZERO_COST_FIXTURE` / `E2E_FIXTURE` | Fixture JSON from `scripts/zero-cost/seed-ci.cjs` (worker, manager, GC machines/product). |
| `E2E_WORKER_CODE` `E2E_MANAGER_USERNAME` `E2E_MANAGER_PASSWORD` `E2E_GC_PRODUCT` `E2E_GC_MACHINES=5,6` `E2E_GC_PROCESS_ID` | Override fixture values. |
| `E2E_API_URL` | Use an existing backend instead of starting `backend/server.js` locally. Writes through it also need `E2E_API_DB_NAME=worker_management_e2e` (operator confirms that backend uses the E2E DB). Production hosts are refused. |
| `E2E_FRONTEND_URL` | Use an existing frontend instead of starting Vite. |
| `KTC_E2E_KEEP_DATA=1` | Keep rows created by the run (default: removed by run id). |

Without `E2E_API_URL` the suite starts `backend/server.js` itself: on the guarded E2E DB
when there is one, otherwise on an unreachable DB so only DB-independent behaviour
(health, auth boundary, input validation) is exercised.

Windows / EXE / native dialogs / visual Excel checks: `desktop/MANUAL_CHECKLIST.md`.
