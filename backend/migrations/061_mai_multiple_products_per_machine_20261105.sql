-- Allow one approved physical-machine report to retain multiple product lines.
-- Existing rows are preserved; only the uniqueness rule is relaxed.
ALTER TABLE production_report_machine_lines
  DROP INDEX uq_report_machine,
  ADD INDEX idx_report_machine_code (report_id, machine_code);
