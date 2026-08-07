ALTER TABLE production_temp_machine_lines
    ADD COLUMN deduction_time_hours DECIMAL(8,2) NOT NULL DEFAULT 0 AFTER maximum_output,
    ADD COLUMN deductions_json JSON NULL AFTER deduction_time_hours;

ALTER TABLE production_report_machine_lines
    ADD COLUMN deduction_time_hours DECIMAL(8,2) NOT NULL DEFAULT 0 AFTER maximum_output,
    ADD COLUMN deductions_json JSON NULL AFTER deduction_time_hours;
