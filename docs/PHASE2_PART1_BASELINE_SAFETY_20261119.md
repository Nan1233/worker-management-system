# KTC — Phase 2 / Part 1 of 10: Baseline & Safety

Date: 2026-11-19  
Repository: `Nan1233/worker-management-system`  
Branch: `refactor/ktc-local-cleanup`  
Scope: source-verified safety inventory and baseline execution gate. **No production source or database modifications.**

## 1. Current result

| Item | Status | Evidence |
|---|---|---|
| Branch available | VERIFIED | GitHub branch search: `refactor/ktc-local-cleanup` |
| Frontend/backend/desktop scripts inventoried | VERIFIED | Three package.json scripts |
| Backend static check operation | VERIFIED BY SOURCE | `backend/scripts/checkSource.js` calls Node `--check` on backend files |
| E2E DB guard | VERIFIED BY SOURCE | `backend/scripts/e2e-db-guard.cjs` requires `DB_NAME=worker_management_e2e` and connects to DB for validation |
| Desktop preflight | VERIFIED BY SOURCE | `desktop/scripts/preflight.cjs` creates/removes test files in local desktop/export folders |
| Desktop Excel smoke | VERIFIED BY SOURCE | `desktop/scripts/smokeExcel.cjs` generates and reads back XLSX files |
| Tests inventory | VERIFIED BY SOURCE | Frontend tests folder and backend tests folder; `backend/tests/flowSuiteManifest.cjs` allowlist |
| CI workflow inventory | VERIFIED BY SOURCE | `.github/workflows/phase1-clean-code.yml`, `phase3-source-acceptance.yml`, `phase2-staging-readonly.yml`, `backend-verify.yml` |
| Environment is an isolated repo checkout | **BLOCKED** | No repository checkout mounted; direct network access to GitHub unavailable in execution container |
| Exact checkout commit SHA / dependency lock install | **NOT VERIFIED** | No local checkout or dependencies |
| Frontend lint/typecheck/build/tests | **NOT RUN** | Requires checkout and locked dependencies |
| Backend check/tests | **NOT RUN** | Requires checkout and locked dependencies |
| Desktop parity/smoke tests | **NOT RUN** | Requires checkout and isolated temp/export location |
| Integration, E2E, staging DB checks | **NOT RUN** | Database isolation and credentials not verified |
| Commit/push of documentation | DONE | Dedicated Part 1 documentation commit; no production code or schema changed |

**Important:** Source inspection and workflow configuration are NOT equivalent to a passing CI run. Part 1 remains **BLOCKED / awaiting executable baseline evidence**; do not promote it to PASS or start Part 2 as if baseline were clean.

## 2. Execution safety matrix

| Command/check | Source-based risk | Decision |
|---|---|---|
| `node --check ...` | Syntax-only, no module execution | Safe in isolated checkout |
| `cd backend && npm run check` | Syntax/source checks, `checkSource.js` invokes Node `--check` | Eligible once checkout available |
| `cd frontend && npm run typecheck` | TypeScript static validation, generates possible build artifacts | Eligible once checkout available |
| `cd frontend && npm run lint` | ESLint source inspection; no `--fix` | Eligible once checkout available |
| `cd frontend && npm run build` | Writes local dist; must have isolated checkout, may invoke bundle/version scripts | Run after reviewing build helper behavior |
| `cd frontend && npm test` | Bulk node-test over all files; may include side effects | **HOLD** pending review of each test |
| `cd backend && npm test` | Bulk node-test with 4 concurrency; not guaranteed DB-free | **HOLD** pending review of each test |
| `node --test <reviewed tests>` | Depends on test imports and mocks | Eligible case-by-case in isolated checkout |
| `cd desktop && npm run preflight` | Writes to real desktop/export directories | **HOLD**, configure isolated paths first |
| `cd desktop && npm run smoke:excel` | Generates synthetic workbooks locally; may write files and invoke multiple tests | **HOLD**, inspect all writers and set temp dirs |
| `cd backend && npm run test:integration` | Integration behavior unknown without audit | **HOLD** |
| `cd backend && npm run e2e:guard` | Connects to DB and checks name; does not itself prove account isolation | **HOLD**, dedicated E2E database required |
| `npm run db:*`, restore, migrate, sync, deploy, remote smoke | May modify DB or environment | **PROHIBITED IN PART 1** |

Do not use `--all-safe` as proof of E2E coverage: `backend/tests/flowSuiteManifest.cjs` is a limited allowlist.

## 3. CI findings

- `phase1-clean-code.yml` is manual-dispatch and runs full backend/frontend regression tests. **Not triggered**; its presence does not imply checks passed.
- `phase3-source-acceptance.yml` includes backend, frontend, desktop (Linux + Windows), staging-safety source checks. **Not triggered**; Windows CI does not prove physical device UAT.
- `phase2-staging-readonly.yml` requires explicit `READ_ONLY_STAGING` confirmation and a SELECT-only staging account; **not triggered**.
- `backend-verify.yml` uses `npm ci --ignore-scripts` and checks proposal review contract/rollback, but still invokes broad backend verification; **not triggered**.
- `frontend/package.json` `build:cloudflare` skips TypeScript `tsc -b` while `build:cloudflare:test` and `build:cloudflare:production` include it. Always keep a separate typecheck gate.

## 4. Baseline runbook — execute only in an isolated checkout

```bash
# A clean, separate checkout of the target branch; never overwrite existing uncommitted files.
git status --porcelain=v1
git rev-parse HEAD
node --version
npm --version

# First installation: only in the isolated checkout; avoid package lifecycle scripts.
cd backend
npm ci --ignore-scripts --no-audit --no-fund
npm run check

cd ../frontend
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run typecheck

# Before running frontend build, confirm node build helper writes only local artifacts.
# Before running unit suites, check imports and environment for DB/HTTP/file writes.
# Before running desktop smoke, configure temporary export and app-data roots.
```

Each execution record MUST contain: HEAD SHA, command, working directory, Node/npm version, exit code, concise output/log path, and whether any network/DB/data-store access occurred. On a failure, record first failing test and do not change unrelated code just to force green.

## 5. Existing local changes to preserve

Do not overwrite or discard any unrelated local edits, especially:
- `scripts/createDatabaseBackup.js`
- `scripts/disasterRestoreDatabase.js`
- `scripts/restoreDatabaseBackupIntoTarget.js`
- `tests/excel-db-sync-backup.test.js`

These files were previously reported as locally modified and have not been validated against a live working tree in this execution environment.

## 6. Acceptance decision

**PART 1: NOT YET COMPLETE — safety inventory complete, executable baseline blocked by missing isolated checkout/network.**

To close Part 1: produce a checkable checkout HEAD; run source check, frontend lint/typecheck/build, reviewed pure tests and desktop synthetic smoke under isolated paths; record successful commands and any failures, without touching shared TEST/production databases. Only then start Part 2/10.


## 7. Transition decision (2026-11-19)

The user requested proceeding quickly to Part 2 while baseline execution is unavailable in this environment.

- Isolated `git ls-remote` attempt failed because `github.com` could not be resolved from the execution container.
- The GitHub source connector can read/write individual files but does not provide a local dependency-enabled checkout or an Actions workflow dispatch tool.
- **Part 1 safety inventory is complete. The baseline execution gate remains OPEN (not PASS).**
- Proceed to **Part 2 source-only, minimal, reversible changes** under an explicit exception. No merge, release, production deployment, DB writes or unsupported PASS claims.
- Restore this baseline gate before any production readiness decision.

This is a transition waiver for starting review/refactor, **not** a waiver of regression requirements before release.
