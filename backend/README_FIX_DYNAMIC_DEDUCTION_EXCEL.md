# Fix dynamic deduction details in Excel

- Excel columns are generated dynamically per process from active deduction types plus deduction types actually used by reports.
- Deduction detail rows are loaded with LEFT JOIN so historical/orphaned type references are not silently dropped.
- Values are mapped primarily by deduction_type_id, with code/name fallback only for legacy data.
- Total deduction is recalculated from production_report_deductions.hours, ensuring it matches detail columns.
- No hard-coded deduction or defect column list is used.
