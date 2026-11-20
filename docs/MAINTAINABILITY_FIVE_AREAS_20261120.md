# Clean code / maintenance follow-up — 2026-11-20

Branch: `refactor/ktc-local-cleanup`. **No merge, deployment, Cloudflare mutation or production TiDB changes.**

## Five maintenance areas

| Area | Work committed | Runtime status |
| --- | --- | --- |
| 1. Remaining Desktop Excel modules | Extracted `companyExcelMetrics.cjs` and `workerReportDateGrouping.cjs` (company builder ~610 lines, worker report builder ~485 lines), preserving the old `getMetrics` diagnostic export and date-separated row logic | Needs Excel smoke and side-by-side workbook comparison |
| 2. Shared production registry | Worker template codes derive from `PROCESS_SHEETS`; worker filename prefixes reuse `monthlyWorkbookNaming.cjs` | Static source compatibility reviewed; runtime parity test added |
| 3. Electron startup dependencies | `deferredDesktopServices.cjs` explicitly binds `authenticatedFetch`, `waitForUsableRendererToken`, `enqueueManualExcelSync` and `isSyncRunning` before window/IPC startup; unbound calls fail with a named error | Startup / auth / IPC tests still required |
| 4. Stable module naming | New entry points `workerReportWorkbook.cjs` and `productionExcelExport.cjs`. Runtime main and active export route through them. v2/v6 implementation files remain backward compatible for scripts and Electron resources. | Existing import consumers preserved |
| 5. Regression gates | Added `desktop/tests/refactor-boundaries.test.cjs` for process file names, CAT/LONG category independence, shared-machine metrics and service initialization; added `test:refactor-boundaries`, `check:refactor-modules` to Desktop and integrated with `check` / `smoke:excel`. Updated `scripts/checkRepositoryLayout.cjs` for moved registry and canonical naming contracts. | **Written and wired, not executed** |

## Additional structure improvement

`companyExcelLocal.cjs` also delegates template structures, OOXML normalization and period handling. `originalProcessExcelTemplate.cjs` delegates its registry/formatting, and `workerReportTemplateLocal.v2.cjs` delegates catalogue matching, template loading and per-day row rendering.

## Preserved business invariants

1. Saved standards/training snapshots must outrank mutable master data for historical approved reports.
2. Shared GC machines count physical machine output once, independently of worker participation time.
3. Encoded `CAT01–CAT10` and `LONG01–LONG08` defect categories remain separate.
4. Date separator rows, company template conditional formatting and `_KTC_SYNC` / `_KTC_META` remain intact.
5. Excel-to-DB writes require manager confirmation; no automatic synchronization of editing-in-progress files.
6. Cloudflare Workers is the web backend; desktop Excel template access remains in Electron/Node.

## Required verification before merge

From repository root:

```bash
npm run check:repository
cd desktop
npm run check:refactor-modules
npm run test:refactor-boundaries
npm run check
npm run smoke:excel
```

Then run Frontend typecheck/build and backend approval/rejection integration tests on a **test** TiDB database, especially concurrency, historical standards, shared machines, Excel import round-trips, and output to the correct company process templates. Inspect package resources with an actual Windows Electron build.

Checks have been **added** to the Desktop package scripts, but no command has been run within this GitHub-only editing session. The sandbox cannot access the repository's network remote, so no passing test result or runtime verification is claimed.

A static scan or lower line count alone does not prove correctness. Do not merge/deploy until these checks have produced passing results.
