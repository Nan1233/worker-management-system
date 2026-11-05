-- Preserve the exact worker-entered actual runtime for every machine line.
-- machine_time_hours remains gross time (actual + deduction); this column stores net actual runtime.
ALTER TABLE production_temp_machine_lines
  ADD COLUMN IF NOT EXISTS actual_time_hours DECIMAL(10,4) NOT NULL DEFAULT 0 AFTER machine_time_hours;

ALTER TABLE production_report_machine_lines
  ADD COLUMN IF NOT EXISTS actual_time_hours DECIMAL(10,4) NOT NULL DEFAULT 0 AFTER machine_time_hours;

-- Backfill existing rows using the established accounting identity.
UPDATE production_temp_machine_lines
   SET actual_time_hours = GREATEST(0, machine_time_hours - deduction_time_hours)
 WHERE actual_time_hours = 0;

UPDATE production_report_machine_lines
   SET actual_time_hours = GREATEST(0, machine_time_hours - deduction_time_hours)
 WHERE actual_time_hours = 0;
