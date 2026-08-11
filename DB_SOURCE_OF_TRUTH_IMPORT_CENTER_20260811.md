# DB source of truth + Import Center
- DB/backend is the only official source of production data.
- Export Excel is always rebuilt from approved DB data.
- Import Center accepts KTC-managed .xlsx workbooks, previews create/update diffs, then sends changes through the existing backend validation/version/audit pipeline.
- After a successful import, the month workbook is rebuilt from DB so Excel becomes a projection of DB again.
- Arbitrary unmanaged workbooks are rejected; use a KTC-exported workbook/template so report identity and sync contract remain auditable.
