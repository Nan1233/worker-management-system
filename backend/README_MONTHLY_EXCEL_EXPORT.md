# Monthly Excel export

- Request: `POST /api/reports/export-excel` with `{ "date": "YYYY-MM-DD" }`.
- Backend rebuilds all approved reports in the selected month from the database.
- The workbook preserves rows 1-326 of `templates/bao-cao-cat-long-export.xlsx`.
- Data is rewritten from row 327 in the same ordering and A:BA mapping as Google Sheet.
- One monthly file is stored at:
  `EXCEL_EXPORT_ROOT/Cắt lồng/<year>/Bao-cao-san-xuat-<month>-<year>.xlsx`.
- Set `EXCEL_STAGE_FOLDER_NAME` to change the stage folder name.
- Set `EXCEL_EXPORT_ROOT` to a persistent Render Disk path if files must survive deployments.
