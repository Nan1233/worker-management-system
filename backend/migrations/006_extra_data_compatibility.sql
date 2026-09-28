ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS extra_data JSON NULL AFTER note;
ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS extra_data JSON NULL AFTER note;
