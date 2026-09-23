ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS entry_date DATE NULL AFTER work_date;
ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS entry_date DATE NULL AFTER work_date;
UPDATE production_reports
SET entry_date = COALESCE(DATE(created_at), work_date)
WHERE entry_date IS NULL;
UPDATE production_reports_temp
SET entry_date = COALESCE(DATE(created_at), work_date)
WHERE entry_date IS NULL;
