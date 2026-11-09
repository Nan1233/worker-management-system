# E2E safety: local API and disposable database only

The write-path E2E runner `node scripts/stagingE2E.cjs` is intentionally restricted to a loopback API (`http://127.0.0.1:19080` by default) and an isolated MySQL/TiDB database named `worker_management_e2e`.

Do not point write-path E2E at a Cloudflare Worker, including `ktc-be-test`. A TEST hostname is not proof of database isolation: a deployed Worker may be configured with a production database connection. The runner refuses all remote URLs before it can contact the database or submit reports.

The separate `backend/scripts/e2e-db-guard.cjs` verifies the exact database name by opening a connection and checking `SELECT DATABASE()`. Configure `DB_NAME=worker_management_e2e` and the other `DB_*` variables only for a disposable database.

Read-only runtime smoke/security checks may target an explicitly approved staging API. They are not substitutes for isolated write-path E2E.

No real employee data, production database credentials, or production endpoints should be used in E2E fixtures.
