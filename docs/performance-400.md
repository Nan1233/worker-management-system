# KTC performance audit (400 users maximum)

This branch adds a real HTTP read workload using Node 20+ (no new dependency). It does not deploy or modify business records. Existing E2E, SQL and synthetic tests remain separate. Do not confuse a virtual user with a unique authenticated employee or 400 simultaneous HTTP requests.

## Quick comparison on shared production DB

Run from repository root in PowerShell. Confirm available quota and normal production conditions first. Known Worker names are derived from wrangler configs; verify URLs with Cloudflare Dashboard or override explicitly. Default cap: 2 requests/sec, 300 requests TOTAL across both targets, max 10 VUs. Stops on first unexpected response, including 429/500/timeout. A failed MAIN prevents TEST from starting, so no comparison is claimed. GET business routes may still create access logs.

Set identical date and separately obtained short-lived fixture JWTs, with matching worker/manager scope and comparable data. Do not commit tokens or paste them into chat. Use local environment variables, e.g. KTC_PERF_MAIN_TOKENS and KTC_PERF_TEST_TOKENS each containing JSON shaped like {"worker":["<worker JWT>"],"manager":["<manager JWT>"]}. No token = skipped authenticated routes, not PASS. No mass login or logout.

    npm run perf:400:self-test
    $env:KTC_PERF_DATE = '2026-11-24'
    npm run perf:400

Output: validation-artifacts/performance-400.json. Keep this local. It contains only timings, route names, origins, counts, and status codes; no bodies or tokens. P95 comparison requires at least 20 samples on both sides, otherwise INSUFFICIENT. The overall outcome is PARTIAL unless a failure occurs; it never certifies the entire system based on read workload alone.

## 400 VUs (isolated environment only)

Provision separate, production-like copies of MAIN and TEST Workers, pointing to a dedicated isolated TiDB copy, not production. Confirm the binding and database identity independently; the environment flag is operator attestation, not technical DB proof. The runner rejects known live Worker origins and requires explicit isolated API and FE origins and both fixture role tokens. No rate limit bypass.

    $env:KTC_PERF_MODE = 'full'
    $env:KTC_PERF_ISOLATED_DB_CONFIRMED = 'YES'
    $env:KTC_PERF_MAIN_API = 'https://YOUR-ISOLATED-MAIN-API'
    $env:KTC_PERF_MAIN_FE = 'https://YOUR-ISOLATED-MAIN-FE'
    $env:KTC_PERF_TEST_API = 'https://YOUR-ISOLATED-TEST-API'
    $env:KTC_PERF_TEST_FE = 'https://YOUR-ISOLATED-TEST-FE'
    npm run perf:400

Staged 1,10,25,50,100,150,200,250,300,350,400 VUs and recovery; 15s think time; global rate default 20/s (max 50/s); default total budget 30000. Actual VUs served, RPS and count are recorded. If budget, latency or errors trip, stop and investigate before another run. For spike or soak choose KTC_PERF_MODE=spike or soak. Soak defaults to 600s and accepts 60..3600s. Set an approved budget based on Cloudflare account-wide quota and DB usage. Run profiles sequentially.

## Other coverage and acceptance

- Route inventory: literal router methods found in backend/routes, including write candidates; review dynamic routes and middleware manually. HTTP catalog is deliberately an explicit safe allowlist. Expand only after verifying roles, parameters, and side effects. Frontend static HTML is smoke only; measure LCP/INP/CLS and long tasks in DevTools or existing Playwright separately.
- DB: use a dedicated read-only SQL identity and backend environment. Existing npm run load:readiness and npm run perf:large-data perform DB read benchmarks, with API envs optional. Set KTC_LOAD_CONCURRENCY=1 and KTC_LOAD_REQUESTS=20 on production; run outside peak. Inspect TiDB Statement Analysis, RU, QPS, connection count, slow queries, EXPLAIN plans before/during/after; do not execute ANALYZE TABLE or index scripts in this audit.
- Existing npm run smoke:cloudflare covers login, standard resolution and export on a fixture. Run at low volume for each target; use matching credentials. Existing npm run e2e:critical requires local API and the dedicated worker_management_e2e DB guard; use it for writes, approvals, shared GC, historical standards and edit conflicts. Do not parallelize the existing E2E fixture suite without per-user isolation.
- Cloudflare dashboard: capture per-Worker CPU/wall time, error status, requests, and remaining plan quota. Compare equivalent time windows. Stop if TiDB or production usage deteriorates; the HTTP runner cannot query live quota or DB RU itself.
- Still needed for release certification: authenticated user-specific fixtures for all four roles and nine processes; dedicated browser journey measurements; concurrent write/approval/idempotency and Excel integrity against isolated DB; sufficient samples for heavy endpoints; independent DB metrics and long endurance run. The script does not claim these are implemented or passed.

## Additional diagnostic commands

`npm run perf:400:db` runs seven read-only SQL cases with 10 sequential samples each and EXPLAIN estimates. Requires backend dependencies, a dedicated read-only SQL account, `KTC_PERF_READONLY_DB_CONFIRMED=YES`, and `KTC_PERF_DB_HOST`, `KTC_PERF_DB_USER`, `KTC_PERF_DB_PASSWORD`, `KTC_PERF_DB_NAME` (optional port defaults 4000). Never use a write-capable production account. Keep results local.

`npm run perf:400:browser` uses existing frontend Playwright dependency and installed Chromium (`cd frontend; npx playwright install chromium`). It measures login TTFB, LCP, CLS, long tasks, resource count and response failures for both desktop and mobile viewports, three cold contexts each. It does not measure authenticated flows or INP. Run separately from load. Both diagnostics commands write `validation-artifacts/performance-diagnostics.json`; set `KTC_PERF_DIAGNOSTICS_OUTPUT` to distinct filenames or run `node scripts/performanceDiagnostics.cjs all` to combine. Check account quota before starting the browser test, as assets also generate traffic.
