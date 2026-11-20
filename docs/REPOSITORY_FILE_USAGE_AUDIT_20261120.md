# KTC file usage, naming and duplication audit — 20/11/2026

Scope: `refactor/ktc-local-cleanup`. GitHub tree inventory covered 1,686 tracked files across 13 top-level directories before this cleanup. This is a static audit, **not** a complete runtime import graph; dynamic `require`, generated references, packaged resources and database migrations require separate checks.

## Confirmed active, do not delete
- `desktop/electron/excelExportContractPatch.v5.cjs`: `launcher.cjs` loads it before v6.
- `desktop/electron/excelExportContractPatch.v6.cjs`: loaded by launcher; imports `workerReportTemplateLocal.v2.cjs`.
- `desktop/electron/workerReportTemplateLocal.v2.cjs`: active via v6, smoke scripts and CI.
- `desktop/electron/excelReportDateSubmissionPatch.cjs`: loaded by launcher before v6; patches module behavior. Requires removal by refactor, not deletion.
- `backend/models/productionTemp*.js`: `Temp` is a workflow entity, not proof of temporary/obsolete files.
- `backend/migrations`: applied migrations are historical schema records; do not delete.

## Candidates needing reference and runtime verification
- `desktop/electron/workerReportTemplateLocal.cjs`: no exact-name search hits, while v2 is actively imported; inspect dynamic imports and packaging before deletion.
- `frontend/src/pages/worker/ProcessPage.layout-legacy.css`: verify stylesheet imports and visual regression.
- `backend/controllers/legacyExcelExportCompatController.js`: legacy name may reflect a supported API; inspect route and external consumers.
- `desktop/copy`: tracked zero-byte file; check tooling/scripts before removal.

## Confirmed byte-for-byte duplicate groups (Git blob SHA)
- 12 paths in `backend/templates/` share one 4,590,283-byte blob: `KTC-Bao-cao-9-cong-doan.xlsx`, multiple mojibake `file m...` names, `file mẫu.xlsx`, `ktc-machine-master-source.xlsx`, `template_legacy_001.xlsx`, `template_legacy_002.xlsx`. These are **identical bytes**, but filename references may differ.
- `desktop/assets/templates/file-mau.xlsx` and `desktop/assets/templates/process-report-template.xlsx` are identical (4,592,907 bytes).
- Backend and Desktop each contain identical `bao-cao-mai-do-export.xlsx` (6,949,782 bytes) and `bao-cao-cat-long-export.xlsx` (1,690,538 bytes).
- `frontend/public/downloads/ktc-production-control.apk` and `public/downloads/ktc-production-control.apk` are identical (4,382,221 bytes); verify publishing paths before choosing one canonical asset.

## Removed generated files in this audit
- 27 tracked files from `frontend/android/capacitor-cordova-android-plugins/build/` (Gradle intermediates), already ignored by root `.gitignore`.
- 2 tracked files from `frontend/playwright-report/` and `frontend/test-results/` removed earlier; added explicit ignore rules to prevent reintroduction.

## Naming assessment
**Not yet standardized.** `excelExportContractPatch.v5.cjs`, `.v6.cjs` and `workerReportTemplateLocal.v2.cjs` embed implementation versions in filenames; `excelReportDateSubmissionPatch.cjs` uses runtime patching; Excel fixtures include mojibake names, ambiguous `Book2.xlsx`/`Workbook1.xlsx` and `template_legacy_*.xlsx`. Avoid mass renames without updating template lookups, packaging scripts and CI.

Proposed canonical naming:
- `desktop/electron/excel/workbookExporter.cjs` (single stable export entry point)
- `desktop/electron/excel/workerReportTemplate.cjs`
- `desktop/electron/excel/processTemplateRegistry.cjs`
- `desktop/electron/excel/workbookCompatibility.cjs` (only while compatibility truly required)
- `backend/templates/<process-code>/<purpose>.xlsx` with a registry mapping stable process codes to paths; no filename guessing.

## Deletion acceptance gate
1. Search static + dynamic import/require, package scripts, CI, template paths and runtime entrypoints.
2. Determine which implementation is canonical; compare output and compatibility.
3. Migrate references to canonical path; run backend tests, frontend build, desktop Excel smoke and packaging.
4. Remove obsolete module/asset only after passing gates; keep Git history.
5. Never delete a file solely because its name contains `vN`, `legacy`, `Temp` or `backup`.

No production DB, merge or deployment touched. **Full automated test suite and Windows packaging have not been run.**

## Follow-up cleanup
- Removed `desktop/copy` (empty tracked placeholder).
- Removed `desktop/electron/workerReportTemplateLocal.cjs` (superseded by the actively imported `.v2.cjs`; GitHub exact-name code search returned no references). Dynamic lookup and full packaged-runtime verification remain outstanding.
- Confirmed export patches modify `monthlyWorkbookLocal` exports in sequence: v5, compact GC patch, then v6. Both `excelReportDateSubmissionPatch.cjs` and v6 override CommonJS module loaders. These are architectural debt; **do not delete or reorder until replacing their behavior with explicit module APIs and regression testing**.
