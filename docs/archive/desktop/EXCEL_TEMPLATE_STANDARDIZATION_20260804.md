# Excel template standardization 2026-08-04

- Re-saved both monthly templates as standard Office Open XML workbooks.
- ExcelJS now loads the original template buffer first.
- Legacy XML sanitizer is used only as a fallback.
- Prevents `reading sheets` and `setting sheetNo` errors caused by malformed workbook metadata.
