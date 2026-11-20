# Desktop bundled Excel templates

- `file-mau.xlsx`: canonical Desktop process workbook/schema reference; retained at its established path.
- `bao-cao-cat-long-export.xlsx` and `bao-cao-mai-do-export.xlsx`: Desktop copies used by the legacy company Excel adapter/fallback path; corresponding copies in `backend/templates/` belong to a separate runtime/package.
- `Bao-cao-san-xuat-08-2026_CHI_TIET.xlsx` and `Du-lieu-doi-chieu-08-2026_CHI_TIET.xlsx`: dated fixtures/compatibility references; keep until source and release consumers are verified.
- `process-report-template.xlsx` was removed on 2026-11-20 as an exact-byte duplicate of `file-mau.xlsx` with no matching current exact-name source lookup.

The Electron extraResources configuration packages the necessary original-company Excel sheets from `../backend/templates`. Do not merge these two directories or rename a workbook without checking `desktop/package.json`, `desktop/electron/companyExcelLocal.cjs`, `desktop/electron/originalProcessExcelTemplate.cjs`, and the export smoke scripts.

Use `npm run check:repository` for the read-only template inventory guard before release. Runtime ExcelJS/rendering and packaged desktop output still require a separate validation step.
