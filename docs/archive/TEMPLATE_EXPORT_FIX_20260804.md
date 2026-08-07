# Template export fix 2026-08-04

- Form fields remain hardcoded in frontend.
- Desktop exports use only the two official templates bundled in `assets/templates`.
- Reconciliation workbook is loaded from `Du-lieu-doi-chieu-08-2026_CHI_TIET.xlsx`.
- Production report workbook is loaded from `Bao-cao-san-xuat-08-2026_CHI_TIET.xlsx`.
- Reports are grouped by `work_date`; one blank row separates different dates and STT restarts by date.
- A header named Ngày nhập or Ngày/Tháng uses `entry_date`; a header named Ngày uses `work_date`.
