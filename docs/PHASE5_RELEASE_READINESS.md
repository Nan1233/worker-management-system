# KTC — Phase 5 Release Readiness

**Current decision: BLOCKED for release — source profiles are prepared, but Cloudflare runtime secrets and account-side configuration are not verified.**

This phase is performed on branch `test`. It changes source/configuration and adds synthetic tests only. It does not authorize a deployment, database connection, migration, live-data validation, GitHub release, installer distribution, or auto-update publication.

## Selected production architecture

- Frontend: Cloudflare Workers Static Assets (Worker name `ktc-frontend`).
- API: Cloudflare Worker (name `ktc-be`).
- Database: TiDB Cloud through `@tidbcloud/serverless`.
- TEST frontend/API remain isolated as `ktc-fe-test` and `ktc-be-test`.
- The Worker endpoint names in this repository define the intended `workers.dev` URLs; their availability and custom-domain routing have not been checked against the Cloudflare account.

## Profiles added

| Component | TEST | Production |
|---|---|---|
| Backend Worker | `backend/wrangler.jsonc` → `ktc-be-test` | `backend/wrangler.production.jsonc` → `ktc-be` |
| Frontend Worker | `frontend/wrangler.jsonc` → `ktc-fe-test` | `frontend/wrangler.production.jsonc` → `ktc-frontend` |
| Frontend API | `frontend/.env.test` → `https://ktc-be-test.nan978971.workers.dev/api` | `frontend/.env.production` → `https://ktc-be.nan978971.workers.dev/api` |
| Desktop | `desktop/package.json` defaults to TEST | `desktop/electron-builder.production.json` overrides packaged metadata to production |

Frontend API configuration now fails closed:
- TEST builds require the TEST API endpoint.
- Production builds require HTTPS and reject TEST Worker hostnames.
- The TEST frontend hostname rejects a production bundle.
- `npm run build:cloudflare` remains explicitly TEST-mode.
- `npm run build:cloudflare:test` and `npm run build:cloudflare:production` provide explicit build profiles.

Desktop now resolves URLs from packaged metadata. The default package is TEST; the separate production electron-builder config sets `ktcDeploymentEnvironment=production`. No installer was built.

## Backend runtime and CORS safeguards

- Cloudflare Worker profile is selected explicitly by `KTC_ENVIRONMENT`.
- `KTC_FRONTEND_ORIGIN` must match the selected environment.
- The Worker rejects CORS configuration that includes the opposite environment's frontend origin.
- The generic Express CORS allowlist no longer silently includes the old Render frontend hostname.
- Worker startup validates that TiDB connection material and a JWT secret of at least 32 characters are present. Secret values are never stored in Git.
- Runtime master-data bootstrap remains disabled in the Worker entrypoint and is guarded by the deployment profile; this avoids implicit master-data writes triggered by normal API traffic.

## Required Cloudflare secrets (not verified)

Configure these through Cloudflare secret storage separately for TEST and production; never add values to `wrangler*.jsonc`, `.env.example`, or Git:
- `TIDB_DATABASE_URL` (or the supported `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` set).
- `JWT_SECRET` (minimum 32 characters).
- Any additional integration secrets actually enabled for the environment.

The source-only gate deliberately reports `CLOUDFLARE_RUNTIME_SECRETS_UNVERIFIED` as a blocker because this repository inspection cannot verify account-side secret configuration.

## Legacy Render configuration

The old root, frontend and backend `render.yaml` files remain in the repository for reference/rollback. They are reported as warnings, not selected as the production architecture. Do not create or update production services from those Render blueprints after this architecture decision.

## Other release warnings

- Component versions are independently versioned; release notes must record FE/BE/Desktop versions and commit SHA.
- Windows code signing is currently disabled.
- Electron auto-update still relies on GitHub Releases; artifacts and update metadata need a separate test.
- There is no dedicated workflow that publishes production artifacts. The Phase 5 workflow only runs source-only checks.

## Safety boundary

- No TiDB, Cloudflare runtime, Render runtime, production or staging connection was made.
- No database query, migration, seed, real-data validation, build, deploy or publish was run.
- No secrets were read.
- No merge to `main`.

## Automated checks

- `node scripts/phase5ReleaseReadiness.cjs`: source-only report.
- `node scripts/phase5ReleaseReadiness.cjs --strict`: exits non-zero until blockers are resolved.
- `node --test tests/phase5-release-readiness.test.cjs`: readiness gate contract.
- `node --test backend/tests/cloudflare-deployment-profile.test.js desktop/tests/deployment-profile.test.cjs`: Cloudflare/desktop profile contracts; synthetic values only.
- GitHub Actions workflow `Phase 5 Release Readiness (Source Only)` runs these checks on branch `test` with repository read-only permissions and no deployment steps.

**Phase 5 status:** TEST/production source profiles and fail-closed checks are in place. Actual release remains blocked until Cloudflare secrets, account-side Worker/domain setup, signing and update distribution are independently verified and approved.
