# KTC Deployment Runbook

## Stop conditions
Stop deployment if tests/build fail, backup verification fails, db:migrate fails, db:schema:verify fails, `/api/health/ready` is not ready, or critical post-deploy smoke fails. Run `backup:verify` before schema release. Do not mark the migration applied manually.

DDL must not be treated as ordinary rollback-safe DML. If DDL is partially applied, stop deployment and perform explicit schema review. There is no automatic down-migration framework; prefer a forward fix or restore a verified DB backup.

## Cutover compatibility
Migration 023 invalidates pre-F11 familyless refresh sessions; these are familyless sessions without family lineage and requires a one-time relogin. A pre-F11 backend is incompatible after the F11 cutover. Old packaged Electron clients cannot safely rotate successor refresh tokens and must be upgraded. Already-open browser tabs should reload the page/sign in again after cutover. Duplicate override requires `force_create=true` plus a server-issued `duplicate_confirmation_token`; old clients that cannot answer the challenge must not force-create.

Source/DB rollback compatibility is not automatically valid across a migration boundary.

| Source | DB | Result |
|---|---|---|
| 023 verifier-aware source | 024/025 | BLOCK |
| new F11 source | pre-023 | BLOCK |
| matching verified source | matching verified schema | ALLOW |

## Canonical release
1. Run tests/build.
2. Run `backup:verify`.
3. Run `db:migrate` only through the canonical `release:db` / backend `db:release` gate.
4. Run `db:schema:verify`.
5. Require `/api/health/ready`.
6. Smoke: manager login, worker login, session refresh, worker report save, approved report read, Excel basic.

`RENDER_PREDEPLOY_RUNTIME_SUPPORT` remains an operational verification item and must be verified on the actual Render service before relying on pre-deploy execution.

## Rerun guidance
| Migration | Rerun | Guidance |
|---|---|---|
| 023 | RERUN_SAFE | Additive IF NOT EXISTS objects are safe; legacy-session revocation means semantic review required. |
| 024 | RERUN_SAFE | Additive lock structures use IF NOT EXISTS; verify schema after rerun. |
| Migration 025 | RERUN_SAFE | Safe when columns are missing or exact-compatible. If an existing definition is incompatible: STOP and REVIEW; do not silently coerce it. |
