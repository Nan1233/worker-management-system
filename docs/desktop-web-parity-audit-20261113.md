# KTC Desktop ↔ Web parity audit (source review, 2026-11-13)

## Scope and baseline
Repository: Nan1233/worker-management-system. Compared `main` and `test` branch source; this is a static source audit, **not** a runtime parity certification. `test` diverges from `main` (464 commits ahead and 11 behind at review). Do not merge the entire test branch solely to synchronize the desktop.

## Confirmed architecture
- `desktop/electron/launcher.cjs` intercepts `index.html` loading and loads the frontend URL selected by `desktop/electron/deploymentProfile.cjs`.
- Both branches define TEST frontend `https://ktc-fe-test.nan978971.workers.dev` and API `https://ktc-be-test.nan978971.workers.dev/api`; production has separate Cloudflare FE/BE endpoints.
- Desktop and browser thus use the same deployed frontend **when** the browser URL and Desktop deployment profile match. A source change on `test` is not automatically a deployed change.
- Desktop-only APIs are exposed through `desktop/electron/preload.cjs` as `window.ktcDesktop`; browser mode does not expose them. `frontend/src/pages/manager/ReportDownload.tsx` intentionally shows desktop-only export affordances.

## Shared Web route inventory (main/test inspected)
- Admin: dashboard, reports/pending, approved, export, workers, master data, statistics, processes, permissions, system, notifications, profile, review, edit; master-control subroutes.
- Manager: dashboard, reports, approved, report-management, edit-proposals, export, workers, master data, statistics, processes, system, notifications, profile, review.
- Lead: dashboard, reports, approved, edit-proposals, export, workers, master data, statistics, processes, system, notifications, profile, review.
- Admin-ops: dashboard, reports, approved, export, workers, statistics, processes, system, notifications, profile, master data, review/edit.
- Worker: home, process selection/input, history/detail/edit, statistics, notifications, profile.
- The router uses `PrivateRoute` and `PermissionRoute`; actual access depends on backend authorization and account permissions.

## Desktop-only functions to preserve
- Excel save and sync, Excel ↔ DB preview/apply, report import preview/apply, auto-sync configuration.
- Export folder open/get/select/reset, statistics Excel save, log folder access, IPC sync notifications.
- Local template/resource packaging, backups, locked-file handling, NAS fallback, `_KTC_SYNC` workbook contract.

## Findings and risks
1. **No separate Desktop route tree found:** the Electron window loads the remote frontend, so a route-by-route duplicate UI migration is not required for matching deployment environments. Runtime parity remains unverified.
2. **Different deployment profiles matter:** a TEST Desktop cannot be compared against a production Web URL; this can produce apparent feature differences.
3. **Branch divergence:** `main` and `test` are not synchronized. Changes to `frontend/src/routes/AppRouter.tsx` and other frontend files on `test` may not be live on `main` or deployed FE. Audit deploy SHA before claiming feature parity.
4. **Desktop export pathway requires separate validation:** `desktop/electron/main.cjs` contains a `syncProcessReportsFirst` path with supported set `GC, MAI, DO`; do not infer other process exports are absent without tracing alternative workbook paths. Validate all nine processes end-to-end.
5. **Desktop-only UI is conditional:** `ReportDownload.tsx` checks `isDesktopApp()`; ensure preload is loaded and `window.ktcDesktop` exists on packaged builds.
6. **Earlier startup PR:** separate draft PR #342 aligns launcher userData path and avoids clearing cache on every launch. Not merged or validated.

## Verification matrix before parity sign-off
- Use same deployed FE origin, backend, account, and permissions on Web and Desktop.
- Compare all routes for admin, admin_ops, manager, lead, worker; check data filters, review, approval, editing, history, statistics, notifications, master data, and master-control.
- Confirm desktop-only buttons appear in EXE, do not appear in browser, and invoke working IPC handlers.
- Run export and Excel ↔ DB regression for GC, MAI, DO, K1, K2, CAN, EP, XLBV, SX3, including shared machines, `_KTC_SYNC`, templates, NAS/local fallback and locked files.
- Test offline startup, login token persistence, permission changes, cache migration, clean Windows PC, and existing userData.

## Conclusion
**Static architecture audit completed; live functional equivalence is NOT yet proven.** Do not report 100% parity or merge/deploy based on this audit alone. No frontend, backend, database or Excel business logic was changed by this report.
