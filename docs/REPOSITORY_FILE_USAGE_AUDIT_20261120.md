# KTC repository file usage and duplication audit — 20/11/2026

Branch: `refactor/ktc-local-cleanup`. **Source audit only**: no build/test, packaged desktop execution, merge/deploy or production DB changes.

## Current template inventory
GitHub content listings on this branch show **19 entries** under `backend/templates/` (18 XLSX files + README) and **7 entries** under `desktop/assets/templates/` before the desktop duplicate removal (6 XLSX + other entry). One byte-identical Desktop XLSX alias was subsequently removed.

- **Backend canonical 9-process workbook:** `backend/templates/KTC-Bao-cao-9-cong-doan.xlsx` (blob `42318b324715fa68df7ef8f298b5788b9282a36b`). Eleven identical filenames were removed in an earlier refactor, leaving one canonical copy.
- **Desktop canonical template:** `desktop/assets/templates/file-mau.xlsx` (blob `482c503a9630610b972e006e07baaf7a6a8550e6`). `process-report-template.xlsx` was an exact-byte duplicate without a current exact-name code-search reference and has been removed.
- **Preserved as required runtime inputs:** Backend `Workbook1.xlsx`, seven `NN_MAU_*.xlsx` templates, `Mau_Bao_Cao_Cong_Nhan_DB_day_du_chi_tiet_STT_FIX.xlsx`, `TT_MAI_TEMPLATE.xlsx`, `TT_DO_TEMPLATE.xlsx`, and other company-specific workbook sources.
- **Intentionally duplicated across deployment boundaries:** `bao-cao-mai-do-export.xlsx` and `bao-cao-cat-long-export.xlsx` exist in both backend and desktop asset folders. Both have code references/fallback lookups; do not deduplicate them across separately packaged applications without testing packaging.
- **APK:** `frontend/public/downloads/ktc-production-control.apk` and `public/downloads/ktc-production-control.apk` share a blob, but may be published by different build roots. Both remain until deployment ownership is confirmed.

## Legacy/versioned source modules

- `desktop/electron/excelExportContractPatch.v5.cjs` was removed: startup no longer loads it, the direct v6 builder is used, and its explicit adapter function names had no indexed consumers.
- `desktop/electron/compactGcExcelPatch.cjs` **remains** because `desktop/scripts/smokeCompactExcel.cjs` uses it explicitly.
- `desktop/electron/excelExportContractPatch.v6.cjs` **remains active** via `main.cjs` and smoke/integration scripts.
- `desktop/electron/workerReportTemplateLocal.v2.cjs` **remains active** via v6, Electron packaging, smoke scripts, tests and CI. Renaming it requires migrating all consumers, not just changing the filename.
- `desktop/electron/launcher.cjs` no longer imports the v5/Compact GC startup patches. Source that was previously loaded through `excelReportDateSubmissionPatch.cjs` should not be assumed active.

Do not delete `backend/models/productionTemp*.js`: “Temp” is a valid pending-report data state, not a disposable file. Applied DB migrations are historical schema records.

## Static safety guard

`npm run check:repository` uses `scripts/checkRepositoryLayout.cjs` to verify canonical templates, identical workbook copies within each template directory, names referenced by `originalProcessExcelTemplate.cjs`, explicit `desktop/package.json` packaged resource lists, approval compatibility exports, and known removed aliases.

`node scripts/auditRepositoryFiles.cjs --json` is an additional *diagnostic* for source imports, duplicate hashes, dynamically resolved candidates and versioned filenames. A file with no static inbound imports is **not automatically unused**.

`scripts/finalReleaseAudit.cjs` has been adapted to inspect the extracted approval/rejection implementation rather than searching for old code inside the now eight-line facade. It also no longer treats the mere existence of GitHub workflows as a release failure.

## Safe deletion rule
1. Inspect exact contents and compare blob hashes.
2. Search current branch references in runtime code, package lists, publishing paths, scripts and CI. Search indexes can lag the branch: inspect live files before changing them.
3. If a file is loaded by name, migrate its consumers first; preserve compatibility exports and packaged resources.
4. Record retained canonical path and deletion reason.
5. Validate by building, running workbook smoke tests, checking Cloudflare interfaces and packaging before merging.

**Known limitation:** no executable regression/build/Windows-package run has been performed on these changes. Full absence of dynamic references cannot be proven by the static audit.
