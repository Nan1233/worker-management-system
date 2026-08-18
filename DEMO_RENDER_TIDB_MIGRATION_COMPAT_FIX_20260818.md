# KTC Render/TiDB migration compatibility fix — 2026-08-18

## Goal

Keep Render/TiDB production read-only with respect to schema changes for this release. The backend must not require the removed legacy migration runtime just to become READY.

## Change

`backend/services/databaseSchemaService.js` now treats the canonical schema as a **minimum runtime contract**:

- Missing canonical tables remain blocking.
- Missing canonical columns remain blocking.
- Invalid canonical column type/null/default/auto-increment/update rules remain blocking.
- Missing canonical indexes remain blocking.
- Invalid canonical indexes remain blocking.
- Legacy/extra tables, columns and indexes are reported for diagnostics but do **not** block READY.

This is intentional for an existing production database that may retain migration-era objects after the runtime migration mechanism was removed.

## No production SQL was changed

This patch does **not** run `ALTER`, `DROP`, `CREATE`, migration, seed, or data mutation against TiDB.

## Migration runtime

The current source already has no runtime migration executor. Do not reintroduce one for this demo release.

## Safety boundary

This compatibility change does not bypass missing/invalid structures required by runtime code. If a canonical object is actually absent or incompatible, `/api/health/ready` remains `503` and the deployment remains blocked.

## Test

Added `backend/tests/database-schema-extra-drift.test.js` to prove that migration-era extras are tolerated while canonical missing/invalid structures remain blocking through the existing verifier logic.
