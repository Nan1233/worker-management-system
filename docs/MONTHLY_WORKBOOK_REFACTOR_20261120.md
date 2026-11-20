# Monthly workbook refactor — 2026-11-20

## Purpose
`desktop/electron/monthlyWorkbookLocal.cjs` is now a small **compatibility facade** (93 lines at this revision), not the home of workbook business rules. The public CommonJS exports and `_private` diagnostic hooks are intentionally retained for existing Desktop callers.

## Module ownership

| Module | Responsibility |
| --- | --- |
| `monthlyWorkbookBuilders.cjs` | Assemble full, process-only, monthly-summary, and split workbooks; preserve original template routing |
| `monthlyWorkbookReportData.cjs` | Validate approved TiDB data; map immutable report snapshots, sort reports, apply date-specific historical settings |
| `monthlyWorkbookDetails.cjs` | Resolve defect/deduction identifiers and aliases, including machine-line accounting |
| `monthlyWorkbookColumns.cjs` | Process-specific column order, headers, number formats, and group headers |
| `monthlyWorkbookCellStyles.cjs` | Cell fonts, fills, borders and alignment |
| `monthlyWorkbookCover.cjs` | Production report cover sheet; process denominator derived from `PROCESS_SHEETS` |
| `monthlyWorkbookProcessSheet.cjs` | Render individual production process sheets |
| `monthlyWorkbookSummarySheets.cjs` | Aggregate approved monthly production and reconciliation sheets |
| `monthlyWorkbookGcHelper.cjs` | Cắt/Lồng manual/machine auxiliary worksheet |
| `monthlyWorkbookSyncMetadata.cjs` | Very-hidden `_KTC_SYNC` metadata, source row identity and physical machine event snapshots |
| `monthlyWorkbookReconciliation.cjs` | Explicit raw database reconciliation workbook |
| `monthlyWorkbookValues.cjs`, `monthlyWorkbookStyles.cjs`, `monthlyWorkbookSchemas.cjs`, `monthlyWorkbookNaming.cjs` | Shared values, palette, process contracts, and filenames |

## Behavioral invariants to preserve

- **Approved reports only:** reject payloads that are not from approved `production_reports`.
- **Historical metrics:** respect `calculationSnapshot`, date-specific `formulaSettingsByDate`, and saved standard snapshots.
- **Shared machines:** use machine-line details and physical event metadata; do not multiply physical production.
- **Templates:** preserve original company/`Workbook1` routing and existing cell formatting.
- **Excel round-trip:** keep `_KTC_SYNC` very hidden with original row identity, `expected_updated_at`, defect/deduction IDs and physical machine information.
- **Compatibility:** retain `buildCompanyOriginalProcessWorkbookLocal` alias and all existing named exports in `monthlyWorkbookLocal.cjs`.
- **No runtime monkey-patching:** workbook exports must not be replaced based on CommonJS module load order.

## Verification status
The code was reorganized on `refactor/ktc-local-cleanup`. A static source review confirmed the facade still declares its existing public exports, and no module-loader monkey patch was reintroduced into it.

**Not yet verified:** Node syntax/build, ExcelJS workbook generation, template and machine-line round-trip, and runtime behavior on Electron. These need a separate validation pass before merge/deployment. No production DB, Cloudflare worker or deployed Desktop application was changed.
