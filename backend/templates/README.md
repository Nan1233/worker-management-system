# Production Excel templates

The canonical historical nine-process workbook is `KTC-Bao-cao-9-cong-doan.xlsx`.
The other files are NOT interchangeable merely because their names contain "template":

- `Workbook1.xlsx` is loaded by the six Workbook1 form layouts (GC, MAI, DO, CAN, EP, XLBV).
- `01_MAU_MAI.xlsx`, `02_MAU_DO.xlsx`, `03_MAU_KIEM_1.xlsx`, `04_MAU_KIEM_2.xlsx`, `05_MAU_CAN.xlsx`, `06_MAU_EP.xlsx`, `07_MAU_XLBV.xlsx` support original-company layouts.
- `Mau_Bao_Cao_Cong_Nhan_DB_day_du_chi_tiet_STT_FIX.xlsx` is loaded by the worker-report builder.
- Other named XLSX assets may support compatibility exports/imports or remain historical samples. Review their callers before removal.

On 2026-11-20 the 11 byte-identical aliases of the historical nine-process workbook were removed from this directory. Their exact content remains in `KTC-Bao-cao-9-cong-doan.xlsx`.

**Do not rename or delete templates used by Electron packaging or backend exports without updating their runtime locators.** Distinct frontend/backend/desktop deployment bundles may intentionally carry copies of the same XLSX.

## Export ownership and fail-closed contracts (phase 5 cleanup)

- `services/templateDrivenProcessExcelExportService.js` is the entry point for the nine process codes.
- GC, MAI, DO, XLBV, EP and CAN delegate to `services/sixProcessWorkbookExportService.js` and read `Workbook1.xlsx`.
- K1, K2 and SX3 read `KTC-Bao-cao-9-cong-doan.xlsx` through `services/excelTemplateContractService.js`.
- Do not substitute the historical nine-process template for Workbook1; their layouts and row contracts differ.
- A changed sheet name, invalid row range, missing mandatory column, ambiguous column mapping or insufficient reserved detail rows must fail explicitly rather than produce a plausible but incomplete workbook.
- SX3 currently has only four reserved detail rows (6–9) in its declared historical contract. Exports exceeding capacity must be rejected until a verified expanded template is supplied.
- Never replace a saved historical standard with the current `product_standards` value during export.
- Desktop workbook replacement is owned by `desktop/electron/excelAtomicFileWriter.cjs`; Excel-to-DB reconciliation is owned by `desktop/electron/excelDbSyncController.cjs`.

### Verification still required before production

The large historical workbook must be inspected sheet-by-sheet against the contract and column headers. Windows Excel/WPS lock, pending replacement, backup and concurrent-save behavior must be verified in the real desktop environment. Static code review is not a substitute for that verification.
