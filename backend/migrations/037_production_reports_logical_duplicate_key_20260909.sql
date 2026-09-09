-- KTC 037: Keep approved production reports compatible with the CVK duplicate lookup.
-- CVK duplicate detection reads logical_duplicate_key from both temp and approved
-- report tables. Some databases already contain the column on production_reports_temp
-- but not on production_reports, which otherwise causes TiDB 1054 during CVK submit.
-- Idempotent for TiDB/MySQL.
ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS logical_duplicate_key VARCHAR(512) NULL AFTER extra_data;
