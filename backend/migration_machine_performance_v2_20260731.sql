-- KTC machine performance V2 - safe additive migration for TiDB/MySQL.
ALTER TABLE production_temp_machine_lines
  ADD COLUMN standard_source VARCHAR(20) NULL AFTER standard_output,
  ADD COLUMN exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0 AFTER standard_source,
  ADD COLUMN counted_output DECIMAL(18,6) NOT NULL DEFAULT 0 AFTER maximum_output,
  ADD COLUMN earned_standard_hours DECIMAL(18,6) NOT NULL DEFAULT 0 AFTER counted_output;

ALTER TABLE production_report_machine_lines
  ADD COLUMN standard_source VARCHAR(20) NULL AFTER standard_output,
  ADD COLUMN exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0 AFTER standard_source,
  ADD COLUMN counted_output DECIMAL(18,6) NOT NULL DEFAULT 0 AFTER maximum_output,
  ADD COLUMN earned_standard_hours DECIMAL(18,6) NOT NULL DEFAULT 0 AFTER counted_output;

CREATE TABLE IF NOT EXISTS production_temp_machine_defects (
  id BIGINT NOT NULL AUTO_INCREMENT,
  machine_line_id BIGINT NOT NULL,
  defect_type_id BIGINT NULL,
  defect_code VARCHAR(50) NOT NULL,
  defect_name VARCHAR(150) NULL,
  quantity INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_temp_machine_defects_line (machine_line_id),
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
  KEY idx_report_machine_defects_line (machine_line_id),
  KEY idx_report_machine_defects_code (defect_code)
);
