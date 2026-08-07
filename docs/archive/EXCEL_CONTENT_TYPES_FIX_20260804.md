# Excel Content Types fix

- Fix `[Content_Types].xml`: `.xml` defaults to `application/xml`.
- Add explicit `/xl/workbook.xml` override.
- Normalize root package relationship to `xl/workbook.xml`.
- Keep runtime sanitation before ExcelJS loads templates.
