# Production Excel templates

The canonical historical nine-process workbook is `KTC-Bao-cao-9-cong-doan.xlsx`.
The other files are NOT interchangeable merely because their names contain "template":

- `Workbook1.xlsx` is loaded by the six Workbook1 form layouts (GC, MAI, DO, CAN, EP, XLBV).
- `01_MAU_MAI.xlsx`, `02_MAU_DO.xlsx`, `03_MAU_KIEM_1.xlsx`, `04_MAU_KIEM_2.xlsx`, `05_MAU_CAN.xlsx`, `06_MAU_EP.xlsx`, `07_MAU_XLBV.xlsx` support original-company layouts.
- `Mau_Bao_Cao_Cong_Nhan_DB_day_du_chi_tiet_STT_FIX.xlsx` is loaded by the worker-report builder.
- Other named XLSX assets may support compatibility exports/imports or remain historical samples. Review their callers before removal.

On 2026-11-20 the 11 byte-identical aliases of the historical nine-process workbook were removed from this directory. Their exact content remains in `KTC-Bao-cao-9-cong-doan.xlsx`.

**Do not rename or delete templates used by Electron packaging or backend exports without updating their runtime locators.** Distinct frontend/backend/desktop deployment bundles may intentionally carry copies of the same XLSX.
