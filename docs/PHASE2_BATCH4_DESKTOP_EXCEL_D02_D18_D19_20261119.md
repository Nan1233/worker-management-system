# KTC Phase 2 — Deferred batch 4/5: Desktop Excel and synchronization

Date: 2026-11-19. Branch: `refactor/ktc-local-cleanup`.

## Result and CI evidence

**4/4 GitHub Actions jobs SUCCESS**, [run 44509214418](https://github.com/Nan1233/worker-management-system/actions/runs/44509214418), application/test SHA `0039c960c758a36e711dea2b5ffd10f9481ecd44`:
- Backend: **162/162** Node test cases PASS.
- Frontend: **73/73** Node test cases PASS; typecheck, lint, build PASS.
- Desktop: **45/45** Node test cases PASS.
- Total: **280/280 selected Node tests PASS**.
- Additional independent Desktop scripts: `node scripts/smokeExcel.cjs` PASS and `node scripts/checkPackagedSharedContract.cjs` PASS.

Tests use ephemeral GitHub Actions filesystem with no DB secrets, NAS or KTC Documents writes. All data are synthetic. No release/merge/deploy.

## Changes made

- New `desktop/tests/phase2-batch4-xlsx-isolated-roundtrip.test.cjs` exercises real `buildSplitMonthlyWorkbooksLocal` on fake approved records for the ten processes + one summary workbook. Creates uniquely named OS-temp directory, writes each of 11 XLSX files with exclusive file creation, re-opens each using ExcelJS, validates filename, visible sheets, _KTC_SYNC veryHidden, contract version, process/month mapping and source report IDs / timestamps; deletes temp directory in `finally`.
- Same test verifies actual `readExcelChanges` on a generic CVK XLSX: edit a row's OK cell in the temporary file, save, parse again and verify report update patch `tt_ok=91` and `expected_updated_at` preserved. No API requests.
- `.github/workflows/phase2-consolidated-safe.yml`: expanded Desktop CI to run new real-XLSX roundtrip, Workbook1 original-sheet regression tests, MAI/DO template parity, backup retention, machine-event metadata, packaging source checks, and safe worker Excel smoke script.

## Confirmed invariants

- Ten process workbooks retain their named process sheets, one monthly summary, stable MM-YYYY filenames.
- `_KTC_SYNC` remains veryHidden, contains expected version, process code, month, worksheet name, report IDs and source concurrency timestamps.
- Original six `Workbook1.xlsx` process templates retain their paper-sheet structures, colored date rows, cells, per-process defect code columns, threshold palettes and formatting per existing regression tests.
- Worker Excel smoke (GC route, CAT/LONG headers and print area) passes.
- Desktop packaging sources include the shared Excel sync contract and original process templates; source contract checks pass.

## Outstanding acceptance blockers — do not misclassify as PASS

**D-02: PASS.** Safe isolated Node/unit tests and synthetic worker Excel smoke are executed without touching production files/DB.

**D-18: PARTIAL.** Renderer and packaging-source tests passed. No physical Windows NSIS/portable package build, signing or installed-device smoke was executed.

**D-19: PARTIAL.** XLSX **export** and temporary file/metadata roundtrip for all 11 files were exercised, and one generic CVK field-edit import passed. Two-way edit/import for all six Workbook1 paper forms **has not been verified**. Code inspection reveals the Workbook1 paper-form column mapping contains no `id` field, whereas the current `readExcelChanges` parser requires an `id` mapping. Import/export row identity and changed-field coverage must be tested and fixed without altering the user-approved visible paper sheets. Current `validateExcelFolder.cjs` also assumes a common row-5 header/freeze layout incompatible with certain Workbook1 layouts; it was deliberately not run against real company output.

These remaining gaps require additional dedicated work, not a claim of full release acceptance.

## Remaining project ledger after batch 4

**8 PASS**, **11 PARTIAL**, **1 OPEN (D-07)**. See `docs/PHASE2_DEFERRED_VERIFICATION_LEDGER_20261119.md`.

Next: **batch 5/5 — final evidence-based acceptance**. Prioritize Workbook1 edit/import row identity, isolated DB concurrency, browser Manager/Worker/Admin scenarios, and Windows package/UAT before production merge. Run only tests affected by any new changes; keep the recorded 280 green tests as pinned-SHA evidence.
