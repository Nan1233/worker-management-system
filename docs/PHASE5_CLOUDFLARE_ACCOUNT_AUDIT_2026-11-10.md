# KTC Phase 5 — Cloudflare account audit (2026-11-10)

**Release decision: BLOCKED.** Read-only metadata inspection, not a deployment or a secret-value audit. The result does not constitute runtime UAT or permission to connect to TiDB or publish an installer.

## Verified account metadata

| Check | Observed | Consequence |
| --- | --- | --- |
| TEST Worker | `ktc-be-test` exists; `KTC_ENVIRONMENT=test`; `KTC_FRONTEND_ORIGIN=https://ktc-fe-test.nan978971.workers.dev` | Profile identity matches intended TEST environment |
| TEST frontend | `ktc-fe-test` exists, workers.dev enabled | Existence does not prove authenticated business flows |
| Production frontend | `ktc-frontend` exists, workers.dev enabled | Runtime API target still needs verification |
| Production backend | `ktc-backend` exists; `ktc-be` does not exist | **Source naming mismatch fixed in PR #325**; deployment configuration must still be reverified before release |
| Production environment | Existing `ktc-backend` has `KTC_ENVIRONMENT=production`, but `NODE_ENV=test` | **Blocking runtime configuration mismatch** |
| Backend credential bindings | On both `ktc-be-test` and `ktc-backend`, `JWT_SECRET`, `DB_PASSWORD`, and `TIDB_DATABASE_URL` are listed as `plain_text` bindings, not `secret_text` | **Security blocker**: migrate/rotate credentials using Cloudflare secrets; never echo current values or commit them |
| Binding inventory | The Workers secret-list endpoint returned no `secret_text` bindings for these scripts | Required secure configuration is not evidenced |

Only Worker names, binding names/types and non-sensitive environment labels/origins were inspected. No credential values, TiDB data, backend requests, or production secrets were retrieved.

## Required actions before release authorization

1. **Stop production changes until credentials are secured.** Inventory current access, prepare replacements for JWT signing and DB credentials and a rollback plan. Rotate credentials and store them as Cloudflare `secret_text` bindings, never `plain_text`; avoid printing them in logs. Verify app sign-in/session behavior after JWT rotation (existing sessions may become invalid). Confirm access scope is least-privilege. Coordinate TiDB credential rotation with the database operator.
2. **Verify the aligned backend source profile.** PR #325 aligns the intended production Worker/API name to the existing `ktc-backend`; verify the runtime hostname, frontend/Desktop build artifacts and deploy configuration during controlled UAT. This source fix alone does not authorize deploying it.
3. **Verify production runtime config.** Source-level deployment profile now rejects mismatched `NODE_ENV` and `KTC_ENVIRONMENT` (this check does not change any deployed Worker). Required production values include `KTC_ENVIRONMENT=production`, `NODE_ENV=production`, correct `KTC_FRONTEND_ORIGIN`, disabled bootstrap/schema diagnostics, CORS isolation, and required secrets. Recheck actual deployed bindings after a controlled change; source settings alone are insufficient.
4. **Run isolated TEST runtime UAT.** With synthetic data and approved TEST credentials, exercise worker submit (including multi-machine, duplicate conflict and lost response), manager approval/rejection, account scoping, and offline replay; verify no duplicate persisted records.
5. **Validate Excel and desktop.** Compare generated totals/NG/time per machine and worker against synthetic approved reports. Validate Windows installer/update metadata, signing decision, upgrade and rollback on a TEST device.
6. **Record authorization evidence.** Save account-side configuration snapshots with secret **names/types only** (no values), UAT results, CI commit SHA, FE/BE/Desktop version matrix, database migration status, rollback owner and a named go/no-go approval.

## Scope and enforcement

The source-only `scripts/phase5ReleaseReadiness.cjs --strict` gate intentionally remains BLOCKED until independent account-side verification is completed. **Passing GitHub CI is not production approval.** The audit captured a snapshot on 2026-11-10; recheck before any release since Cloudflare configuration can change independently.

No modification of Cloudflare settings, TiDB, GitHub `main`, or production deployment was performed by this audit.

## Source follow-up

PR #325 merged to `test`: backend Worker naming, frontend production API and desktop production API align to `ktc-backend`. The Cloudflare account metadata above is a **historical snapshot**; do not treat it as current validation after changes.

This guard refuses to start if the existing deployed production binding `NODE_ENV=test` is carried into a new release. Fix the binding through a separately authorized and rollback-ready runtime change before deploying new backend source.
