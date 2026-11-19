# KTC — Phase 2 / Part 9 of 10: Desktop Excel and synchronization

Date: 2026-11-19. Branch: `refactor/ktc-local-cleanup`.

## Source findings

- `desktop/electron/monthlyWorkbookLocal.cjs` (~1,430 lines before change) renders ten process workbook sheets, calls original Excel templates, and contains workbook sync metadata `_KTC_SYNC`.
- It also included a pure file-naming policy mapping process codes to fixed prefixes and deriving `MM-YYYY` filenames. This can be refactored without loading ExcelJS, modifying spreadsheet formulas or writing any files.
- `desktop/electron/companyExcelLocal.cjs` (a distinct company workbook flow) remains untouched.
- `desktop/electron/excelPaths.cjs` selects NAS/local export locations and may write folders. No path/NAS operations were run.
- `desktop/electron/reportDetailNormalizer.cjs` is a duplicate of backend normalizer with explicit sync requirement; no unverified change made.

## Implemented

1. Added `desktop/electron/monthlyWorkbookNaming.cjs`, extracting the existing fixed process prefixes and `monthlyFileSuffix`, `processWorkbookFileName`, `summaryWorkbookFileName` exactly from the renderer. The module is pure and dependency-free.
2. Updated `desktop/electron/monthlyWorkbookLocal.cjs` to import and re-export the same naming API; removed the duplicated inline naming block. The workbook template rendering, sheets, colors, formulas, `_KTC_SYNC`, process metadata and format code are unchanged.
3. Added `desktop/tests/monthly-workbook-naming-parity.test.cjs` with five tests for all ten process filenames, monthly summary, payload month precedence, error compatibility and renderer/template/sync contract.

## GitHub commits

- `14d35ee2db93bfc1db2b7b3eda6e56da24edb260` — pure naming module
- `e7f252b0926d3bab8343b0336713ed22fbca9c9e` — renderer delegates to module
- `a51a57fe96a1d12835ebfd4ec5ab7f1da10f3637` — parity tests

## Evidence

Re-fetched modified files and checked ten source invariants: **10/10 true**. Source verification confirms naming import/exports, ten process naming mappings, continued `_KTC_SYNC` metadata, and original template call references.

**Not run:** repository Node test, `npm run check`, XLSX generation, import/sync, process-specific template comparison, NAS/local fallback behavior, Electron package smoke, Windows release check. Do not claim Excel parity PASS based on source checks alone.

## Safe verification commands and conditions

On an isolated checkout with installed dependencies:

```bash
cd desktop
node --test tests/monthly-workbook-naming-parity.test.cjs
npm run check
```

After inspecting smoke script destinations and configuring temporary user-data/export roots, generate synthetic workbook fixtures for GC, MAI, DO, K1, K2, CAN, EP, XLBV and SX3; preserve CVK support. Compare sheet names/order, merged ranges, column headers, formulas, date formats, custom deductions/defects, snapshot metrics, physical machine event counting, `_KTC_SYNC` version/keys and round-trip DB sync metadata. Never run any writing test against real NAS, KTC Documents or production/shared TEST DB.

## Deferred ledger

Previous D-01–D-17 remain open. Added:
- D-18: execute naming regression and Desktop check/packaging safety on a pinned checkout.
- D-19: synthetic XLSX/template/sync regression, no physical files/NAS or DB writes.

See `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md` for the consolidated one-time verification plan.

## Status

**Part 9 source refactor is implemented and source verified; runtime XLSX and sync acceptance remains pending.** No merge, release, DB/data edits or deployment.
