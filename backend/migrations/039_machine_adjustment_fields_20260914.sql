-- Per-machine setup/adjustment tracking.
-- Safe for existing data: all existing rows default to zero.

ALTER TABLE production_temp_machine_lines
  ADD COLUMN adjustment_minutes DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER machine_time_hours,
  ADD COLUMN adjustment_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER adjustment_minutes;

ALTER TABLE production_report_machine_lines
  ADD COLUMN adjustment_minutes DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER machine_time_hours,
  ADD COLUMN adjustment_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER adjustment_minutes;
