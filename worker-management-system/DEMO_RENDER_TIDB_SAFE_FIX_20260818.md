# KTC Demo - Render/TiDB Safe Runtime Fix - 2026-08-18

## Scope

This release fixes the production startup blocker without changing Render/TiDB data and without running migrations.

### Runtime schema policy

- Render/TiDB connection remains mandatory.
- Runtime readiness now checks a minimum structural contract: required canonical tables and a small set of columns used by the existing application.
- Legacy/extra tables, columns, indexes, and non-critical type/index drift are diagnostic-only and do not block startup.
- The canonical SQL file remains source-of-truth for future audit/rebuild work; it is NOT executed at runtime.
- No migration runtime is introduced.

## Why

The production database is an existing TiDB database. The previous exact canonical type/index verifier was too strict for a demo deployment and could keep the service at DATABASE_CONTRACT_INVALID even though the database connection and runtime-required structures were present.

## Safety boundary

This change does NOT:

- ALTER/DROP/DELETE anything in TiDB
- run migrations
- disable database connection validation
- return READY when the required runtime tables/columns are missing
- change application business logic

## Verification performed locally

- Root contract tests: 151/151 PASS
- Frontend contract tests: 146/146 PASS
- Backend tests: 411/412 PASS
  - The single failure is the existing environment-only `canonical-template-contract.test.js` because `exceljs` is not installed in the isolated test environment. `backend/package.json` declares `exceljs` 4.4.0.
- Changed backend service and verifier syntax: PASS
- No migration files/runtime found under backend; only the canonical full-database source SQL remains.

## Expected Render result

After deploying this source, if the existing TiDB contains the minimum required tables/columns, startup should proceed past schema readiness:

`Database connected; SSL=true`

`Database runtime contract READY (v26; MINIMUM_STRUCTURAL_V1)`

and `/api/health/ready` should become HTTP 200.

If it remains 503, the response will identify the actual missing required table/column rather than being blocked by non-critical canonical drift.
