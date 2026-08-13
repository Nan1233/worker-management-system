-- KTC Wave 1A: persist the exact historical standard identity used by reports.
ALTER TABLE production_reports_temp ADD COLUMN IF NOT EXISTS standard_version_id BIGINT NULL AFTER standard_output;
ALTER TABLE production_reports_temp ADD COLUMN IF NOT EXISTS machine_standard_id BIGINT NULL AFTER standard_version_id;
ALTER TABLE production_reports ADD COLUMN IF NOT EXISTS standard_version_id BIGINT NULL AFTER standard_output;
ALTER TABLE production_reports ADD COLUMN IF NOT EXISTS machine_standard_id BIGINT NULL AFTER standard_version_id;

ALTER TABLE production_temp_machine_lines ADD COLUMN IF NOT EXISTS standard_version_id BIGINT NULL AFTER product_standard_id;
ALTER TABLE production_temp_machine_lines ADD COLUMN IF NOT EXISTS machine_standard_id BIGINT NULL AFTER standard_version_id;
ALTER TABLE production_report_machine_lines ADD COLUMN IF NOT EXISTS standard_version_id BIGINT NULL AFTER product_standard_id;
ALTER TABLE production_report_machine_lines ADD COLUMN IF NOT EXISTS machine_standard_id BIGINT NULL AFTER standard_version_id;

CREATE INDEX IF NOT EXISTS idx_prt_standard_version ON production_reports_temp (standard_version_id);
CREATE INDEX IF NOT EXISTS idx_pr_standard_version ON production_reports (standard_version_id);
CREATE INDEX IF NOT EXISTS idx_ptml_standard_identity ON production_temp_machine_lines (standard_version_id, machine_standard_id);
CREATE INDEX IF NOT EXISTS idx_prml_standard_identity ON production_report_machine_lines (standard_version_id, machine_standard_id);
