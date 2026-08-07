-- KTC V3: Manual reports may have NULL machine_no; machine reports retain per-line standards.
-- Safe to re-run on TiDB 8.x / MySQL-compatible engines.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(100) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
);

ALTER TABLE production_reports_temp
  MODIFY COLUMN machine_no VARCHAR(100) NULL;

ALTER TABLE production_reports
  MODIFY COLUMN machine_no VARCHAR(100) NULL;

ALTER TABLE production_temp_machine_lines
  ADD COLUMN IF NOT EXISTS standard_source VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS counted_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earned_standard_hours DECIMAL(18,6) NOT NULL DEFAULT 0;

ALTER TABLE production_report_machine_lines
  ADD COLUMN IF NOT EXISTS standard_source VARCHAR(20) NULL,
  ADD COLUMN IF NOT EXISTS exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS counted_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS earned_standard_hours DECIMAL(18,6) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS production_temp_machine_defects (
  id BIGINT NOT NULL AUTO_INCREMENT,
  machine_line_id BIGINT NOT NULL,
  defect_type_id BIGINT NULL,
  defect_code VARCHAR(50) NOT NULL,
  defect_name VARCHAR(150) NULL,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_temp_machine_defect (machine_line_id, defect_code),
  KEY idx_temp_machine_defects_code (defect_code)
);

CREATE TABLE IF NOT EXISTS production_report_machine_defects (
  id BIGINT NOT NULL AUTO_INCREMENT,
  machine_line_id BIGINT NOT NULL,
  defect_type_id BIGINT NULL,
  defect_code VARCHAR(50) NOT NULL,
  defect_name VARCHAR(150) NULL,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_machine_defect (machine_line_id, defect_code),
  KEY idx_report_machine_defects_code (defect_code)
);

INSERT IGNORE INTO schema_migrations(version)
VALUES ('20260731_manual_machine_consistency_v3');
