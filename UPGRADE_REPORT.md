# KTC Worker Management System — Enterprise upgrade report

## Release objective

Hardening release for production-company rollout without rewriting the existing frontend/backend/desktop architecture.

## Backend

- Reporting-period lock now blocks approved-report update and delete.
- Update also rejects moving a report into a locked target period.
- Approved report update/delete requires a human audit reason.
- Removed duplicate legacy update/delete controller implementations.
- Added production environment fail-closed validation.
- Sync worker validates environment + DB before processing and shuts down cleanly.
- Added checksum-based database migration runner.
- Added DB-level UNIQUE idempotency protection for `(worker_id, client_request_id)`.
- Migration preflight refuses to silently delete existing duplicate production data.
- Process Excel export no longer mutates process-global environment variables during requests.
- Schema default version advanced to `20260809`.

## Frontend

- Approved-report edit UI requires an audit reason.
- Approved-report delete service sends an explicit reason payload.
- ProductionReport contract includes the audit reason field.
- Frontend fallback version now matches the frontend package version.
- Existing auth/session storage, error boundary, worker process rules, responsive UI and report workflows were preserved.

## Desktop

- Enforces a single running Electron instance to prevent concurrent local Excel/cache writes.
- Second-instance attempts focus the existing window and are logged.
- Unrequested Electron permission prompts are denied by default.
- Existing context isolation, sandboxing, navigation allowlist, retry logic and split monthly Excel architecture were preserved.

## Verification performed in the build environment

- Backend `npm run verify`: **75/75 tests PASS**.
- Frontend source tests: **8/8 PASS**.
- Desktop `npm run check`: **PASS**.
- Backend + Desktop JavaScript/CJS syntax scan: **155 files, 0 syntax errors**.
- Secret / unsafe Electron/CORS source scan: no hard-coded DB/JWT password, wildcard credentialed CORS, `nodeIntegration:true`, or `contextIsolation:false` found.

## Verification requiring dependencies on the target machine

The build environment could not fully install frontend/Desktop dependencies from its package registry. On the Windows development machine run:

```cmd
cd /d C:\VSCode\worker-management-system
npm run install:all
npm run verify
npm run build:exe
```

`npm run verify` includes frontend lint/typecheck/build and the real ExcelJS smoke test.

## Required database step before production deploy

Back up TiDB first, then:

```cmd
npm run db:migrate
npm run db:indexes
```

If migration 008 reports duplicate `client_request_id` rows, review those rows manually. The migration intentionally refuses to remove production data automatically.
