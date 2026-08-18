# KTC Demo Code Fix Report — 2026-08-18

## Scope
This release fixes code-level demo blockers without changing Render configuration, TiDB data, or executing SQL migrations.

## Fixed
- Runtime database readiness now checks only the declared minimum structural tables instead of treating the full canonical schema as a startup blocker.
- Removed the duplicate runtime-contract diagnostic property.
- Notification schema handling is read-only at runtime; the app no longer ALTERs/CREATEs database objects.
- Notification writes/read history remain compatible when optional link/entity columns are absent.
- Removed migration `backend/database/migrations/027_notifications_runtime_columns.sql`.
- Added public `/mobile` and `/download` routes for the mobile/PWA install page.
- Mobile install links use HashRouter-safe URLs.
- Android no longer auto-downloads an APK merely by opening the install page.
- PWA manifest accepts any orientation for tablet/desktop/mobile.
- Dark-mode contrast stylesheet is explicitly loaded.

## Verification
- Root contract tests: 151/151 PASS.
- Frontend tests: 146/146 PASS.
- Backend tests: 411/412 PASS in the isolated environment; the only remaining failure is the canonical Excel template test because `exceljs` could not be installed. No source assertion failed.
- Frontend TypeScript/lint/build were not claimable because dependency installation could not complete in the isolated environment.
