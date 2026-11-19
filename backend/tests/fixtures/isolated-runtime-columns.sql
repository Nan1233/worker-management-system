-- Disposable TiDB fixture from archived project migration 060.
-- Original history: commit 2f54247f0f5f5392ded2dff453bc4027b7dde669
-- This is not applied by the runtime or to a shared database.
ALTER TABLE product_standards
  ADD COLUMN IF NOT EXISTS encoding_code VARCHAR(180) NULL;

ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL;

ALTER TABLE machine_production_events
  MODIFY COLUMN standard_source VARCHAR(64) NULL;

ALTER TABLE production_temp_machine_lines
  MODIFY COLUMN standard_source VARCHAR(64) NULL;

ALTER TABLE production_report_machine_lines
  MODIFY COLUMN standard_source VARCHAR(64) NULL;
