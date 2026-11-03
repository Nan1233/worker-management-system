# KTC — Phase 5 Release Readiness

**Current decision: BLOCKED — do not publish or deploy.**

This document records the source-only release preparation performed on branch `test`.
It does not authorize a production deployment, database migration, live-data validation,
GitHub release, installer distribution, or auto-update publication.

## Scope and safety boundary

- Review repository configuration and release contracts only.
- Use synthetic/unit/CI tests; do not connect to TiDB or Render runtime.
- Do not run database schema checks, migrations, backup/restore drills, real-data audits,
  production smoke tests, or write-path E2E.
- Do not merge `test` into `main`, publish a GitHub Release, sign/distribute installers,
  or trigger deployment.

## Release blockers found in the repository

1. **Desktop is explicitly TEST-wired.** `desktop/electron/launcher.cjs` overwrites
   `KTC_API_URL` with `https://ktc-be-test.nan978971.workers.dev/api` and loads
   `https://ktc-fe-test.nan978971.workers.dev`. An installer built from this branch
     must be treated as a TEST build, not a production installer.
2. **Frontend Render manifest points to TEST API.** `frontend/render.yaml` sets
   `VITE_API_URL` to the TEST Worker endpoint.
3. **Deployment topology is not singular.** Root `render.yaml` describes a Render
   frontend/backend pair, while `frontend/render.yaml` points to a Worker TEST backend.
   The repository does not establish which one is the approved production topology.
4. **CORS production origin is not verifiable from tracked config.** Backend's built-in
   allowlist contains an older Render frontend hostname; root `render.yaml` does not
   declare `CORS_ORIGINS`. A Render dashboard value may exist, but it was not inspected.
5. **Desktop release/update controls need an explicit decision.** Windows signing is
   disabled in `desktop/package.json`; Electron auto-update is configured against GitHub
   Releases. Before broad distribution, verify signing, release artifacts, update metadata,
   and update/rollback behavior on a test workstation.

## Version matrix observed on branch test

| Component | Version |
|---|---:|
| Root release scripts package | 1.9.15 |
| Frontend | 1.9.31 |
| Backend | 1.9.19 |
| Desktop | 1.9.17 |

These may be independently versioned packages; do not force them to the same number
without an agreed versioning policy. The release notes must identify the exact versions
and commit SHA of every shipped component.

## Additional configuration warning

`backend/render.yaml` enables `autoDeploy: true` and has a `preDeployCommand` that
runs schema/runtime checks. Do not select or apply that alternate blueprint without
reviewing the exact Render service configuration and the side effects of its pre-deploy
commands. The source-only Phase 5 gate does not execute these commands.

## Required actions before an actual release

- Select and document the canonical production topology and production FE/API domains.
- Replace hardcoded TEST URLs with an explicit, fail-closed build/runtime environment
  configuration. TEST builds must remain TEST; production builds must reject TEST URLs.
- Confirm the real Render `CORS_ORIGINS` value matches the approved frontend origin.
- Agree component versioning, release tag, changelog, owner and rollback plan.
- Decide whether to sign Windows installers and validate the certificate/SmartScreen path.
- Validate GitHub Release assets and Electron updater metadata on a non-production test
  installation before enabling distribution.
- Obtain explicit approval for any staging runtime checks. Production smoke checks are
  read-only, but must still be separately authorized.

## Automated gate added

- `node scripts/phase5ReleaseReadiness.cjs`: prints a source-only readiness report.
- `node scripts/phase5ReleaseReadiness.cjs --strict`: exits non-zero while blockers remain.
- `node --test tests/phase5-release-readiness.test.cjs`: verifies the gate detects the
  current TEST/production configuration conflict and fails closed.
- GitHub Actions workflow `Phase 5 Release Readiness (Source Only)` runs these checks
  on branch `test`; it has read-only repository permissions and no deployment steps.

**Phase 5 status:** release preparation and fail-closed checks added; production release
remains blocked until the configuration and operational decisions above are resolved.
