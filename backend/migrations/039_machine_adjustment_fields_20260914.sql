-- Per-machine setup/adjustment tracking.
-- Idempotent for partially applied databases.

ALTER TABLE production_temp_machine_lines
  ADD COLUMN IF NOT EXISTS adjustment_minutes DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_count INT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE production_report_machine_lines
  ADD COLUMN IF NOT EXISTS adjustment_minutes DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_count INT UNSIGNED NOT NULL DEFAULT 0;
