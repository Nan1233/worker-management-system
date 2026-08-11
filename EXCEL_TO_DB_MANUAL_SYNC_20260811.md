# Excel -> DB manual sync (2026-08-11)

- Added Desktop button: `Cập nhật DB từ Excel` on Approved Reports.
- Preview is read-only: report ID, source file/sheet/process, and field-level before -> after values.
- DB update only runs after explicit confirmation.
- Disabled 20-second automatic Excel -> DB watcher.
- Updating Excel from DB is blocked if there are unsynced workbook edits for that month.
- Existing optimistic concurrency (`expected_updated_at`) remains enforced.
- Successful Excel edits keep report versions and now write audit `changed_fields` with before/after values plus source file/sheet/process.
- After a successful Excel -> DB sync, affected monthly workbooks are rebuilt from the DB snapshot.
- System Center can render object-style `changed_fields` as a before/after diff table.

Validation performed:
- `node desktop/scripts/checkExcelDbSync.cjs` PASS
- `node frontend/scripts/checkThemeContract.cjs` PASS
- `node --test backend/tests/excel-db-sync-backup.test.js` 3/3 PASS
- Node syntax checks PASS for modified backend/desktop CommonJS files.

Full frontend typecheck was not run because this ZIP intentionally has no `node_modules`; run `npm run install:all && npm run verify` in the cloned repository.
