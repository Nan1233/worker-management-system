# Machine-line validator export fix — 2026-08-05

- Added `createMachineLineValidator({ query })` so integration tests can inject a mock query function.
- Kept the existing `validateMachineLines` export for production controllers.
- The default production validator still uses the configured MySQL/TiDB connection.
- Added Node.js engine metadata (`22.x`) for consistent Render deployment.

Verification from the repository root layout:

```text
npm --prefix backend run verify
Syntax OK: 92 JavaScript files
tests: 20
pass: 20
fail: 0
```
