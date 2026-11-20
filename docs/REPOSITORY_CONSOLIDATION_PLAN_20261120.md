# KTC repository consolidation — implementation and remaining gates

Branch: `refactor/ktc-local-cleanup`. No merges, Cloudflare deployments or production DB operations.

## Implemented on the refactor branch

1. `desktop/electron/main.cjs`, `monthlyWorkbookLocal.cjs` and `backend/models/productionTempApprovalModel.js` are small compatibility/orchestration entry points. Excel export, authentication, IPC, approval SQL, snapshots and transaction workflows are split into dedicated modules.
2. `frontend/src/pages/worker/ProcessPage.tsx` delegates submission, duplicate reports, offline retries, form mode resets and draft lifecycle to specialized hooks.
3. Eleven exact duplicate aliases in `backend/templates` were removed, retaining `KTC-Bao-cao-9-cong-doan.xlsx`.
4. The unreferenced exact copy `desktop/assets/templates/process-report-template.xlsx` was removed, retaining `desktop/assets/templates/file-mau.xlsx`.
5. The unused v5 Excel adapter was removed. The current v6 builder, Compact GC smoke helper and worker-report v2 template remain where scripts/package manifests still refer to them.
6. `scripts/finalReleaseAudit.cjs` now checks the extracted approval workflow sources. `npm run check:repository` adds a read-only template/package integrity gate.
7. README and audit documents list canonical paths and ownership; filenames carrying `v2`, `v6` or `legacy` are not deleted solely for their names.

## Intentional separations

- Backend/desktop company template copies support separate binaries and fallback paths.
- Public APK copies may be needed by different publishing roots.
- `productionTemp` model names describe pending business data, not disposable files.
- Existing migrations, `_KTC_SYNC`, and historical standard snapshots must be preserved.
- Cloudflare Workers is the current web backend; Desktop Excel rendering requires Node/Electron or other supported filesystem/ExcelJS runtime.

## Still blocked from being called production-ready

- TypeScript checks and frontend build;
- Backend approval/rejection transaction and concurrency checks against a safe TiDB test database;
- Desktop Excel smoke/round-trip, worker report and shared-machine accounting;
- Electron packaged-resource validation, Windows packaging;
- Cloudflare deployment and endpoint contract checks.

The structural cleanup **is implemented** but its runtime reliability **has not been verified**. Retain the branch until validation succeeds. Do not merge or deploy based only on file-count reductions or static reference searches.
