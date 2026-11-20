# KTC repository consolidation — one authoritative implementation

## Scope and safety
Branch: `refactor/ktc-local-cleanup` only. No merge, deployment or production DB changes.
Delete only generated artifacts immediately; retain active versioned modules until their runtime entrypoints, tests and packaging references are migrated and verified.

## Verified inventory
- `frontend/playwright-report/index.html`: committed Playwright-generated HTML report — removed.
- `frontend/test-results/.last-run.json`: committed Playwright run state — removed.
- `desktop/electron/excelExportContractPatch.v5.cjs`: **active**: required by `desktop/electron/launcher.cjs`; do not delete.
- `desktop/electron/excelExportContractPatch.v6.cjs`: **active**: required by launcher, Excel integration and tests; do not delete.
- `desktop/electron/workerReportTemplateLocal.v2.cjs`: **active**: required by launcher, v6, scripts, package metadata and CI; do not delete.
- `desktop/electron/workerReportTemplateLocal.cjs`: no indexed exact-name references found; **candidate only**, requires dynamic import/package/runtime check before deletion.
- `backend/controllers/legacyExcelExportCompatController.js`: name says legacy but route/API compatibility may still depend on it; inspect routes before removal.
- `backend/templates`: multiple Excel fixtures/templates with similar or encoding-damaged names, some multi-MB. Preserve until template loader, deployment packaging and smoke tests identify canonical files.
- `backend/migrations`: historical migrations are not redundant source files; never delete applied migrations.

## Target boundaries
```
backend/
  modules/
    production/{domain,application,infrastructure,api}
    approval/{domain,application,infrastructure,api}
    standards/{domain,application,infrastructure,api}
    reporting/{domain,application,infrastructure,api}
  shared/
frontend/src/
  features/{worker-reports,manager-reviews,master-data}
  shared/{api,ui,utils}
desktop/electron/
  bootstrap/
  ipc/
  excel/{templates,mapping,rendering,sync}
```
This is a target design, not a claim that these directories already exist. Prefer small migrations with compatibility exports and tests, not a one-shot rename.

## Required removal gate per candidate
1. Identify runtime import graph (including dynamic requires), scripts, CI, package entrypoints and Electron-builder inclusion.
2. Determine canonical implementation; compare behavior and exported contracts.
3. Move active behavior into one unversioned module, update all import sites, keep temporary re-export shims only if needed.
4. Run Node unit, frontend typecheck/build, Desktop smoke Excel with real fixture templates, and Windows packaging checks.
5. Delete unused modules, duplicate fixtures and temporary shims only after passing gates; retain Git history.
6. Record a deletion manifest with reason and evidence. Never treat name pattern `vN` alone as proof of obsolescence.

## Current blockers
Full Node/Electron runtime and Windows packaging regression not yet executed in this environment. The three versioned Desktop modules are demonstrably active and **must not be deleted blindly**.
