-- KTC Wave 1B F03: immutable worker training percentage snapshot.
ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS training_percent_snapshot DECIMAL(7,2) NULL AFTER machine_standard_id;

ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS training_percent_snapshot DECIMAL(7,2) NULL AFTER machine_standard_id;
