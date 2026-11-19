# KTC — Giai đoạn 8/10: fail-closed Excel NG / deduction imports

Date: 2026-11-19. Branch `refactor/ktc-local-cleanup`. No merge, deploy, real DB or company Excel write.

## Implemented

- `desktop/electron/excelDbSync.cjs`: `mergeEditableDetails` now rejects negative, non-numeric, formula-error/object values and fractional NG quantities in mapped NG and deduction columns with `EXCEL_SYNC_INVALID_DETAIL_VALUE`. Previously the normalization dropped these values, which could silently delete approved NG/deduction details when importing edited workbooks.
- Empty and zero remain intentional clears **only for a mapped code**. Original DB details not represented by the paper template remain untouched.
- `desktop/tests/phase2-batch4-xlsx-isolated-roundtrip.test.cjs`: deterministic tests for negative, nonnumeric, fractional NG, Excel formula-error objects, zero/blank clearing and preservation of unmapped original details. Existing real XLSX export/import tests continue to cover six Workbook1 sheets, K1/K2, generic CVK, hidden identity, version token and duplicate-ID rejection.
- The existing consolidated GitHub Actions workflow watches both changed paths and runs Desktop Linux + Windows fixture tests.

## Verification and limitations

Code commits `ed292211c684bfc7533261303c99176006d2204a` and `874d46abb3f6991a862ed65a36c8284141dedec7`. Check [CI runs](https://github.com/Nan1233/worker-management-system/actions?query=branch%3Arefactor%2Fktc-local-cleanup) for the source SHA and actual test result. Existing queued/in-progress jobs are not proof of PASS. No real TiDB connection or CAS conflict execution was performed.

**D-19 remains PARTIAL** until end-to-end NG/deduction edits on all real paper templates, Backend approval validation, DB CAS conflict handling, import preview and Windows GUI are verified. **D-18 PARTIAL** until installed Windows packaging acceptance. D-04/D-05/D-09/D-11/D-13/D-14/D-15/D-16/D-17 remain PARTIAL; D-07 OPEN. Ledger stays **8 PASS, 11 PARTIAL, 1 OPEN**. Production release NOT APPROVED.
