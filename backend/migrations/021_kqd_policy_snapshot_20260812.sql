-- KTC Wave 1B F04: immutable KQD exclusion policy snapshot for report parent state.
ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS exclude_kqd_from_tt_snapshot TINYINT(1) NULL AFTER training_percent_snapshot;

ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS exclude_kqd_from_tt_snapshot TINYINT(1) NULL AFTER training_percent_snapshot;
