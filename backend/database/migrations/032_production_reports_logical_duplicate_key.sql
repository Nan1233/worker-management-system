-- KTC 032: Add logical duplicate identity to approved production reports.
-- CVK duplicate lookup and future report reconciliation may read this field.
-- Idempotent for MySQL/TiDB.
ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS logical_duplicate_key VARCHAR(512) NULL AFTER extra_data;
