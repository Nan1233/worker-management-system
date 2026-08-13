-- KTC Wave 1C Part 2: shared-machine accounting schema.
-- Physical machine truth is stored once per production event.
-- Existing production_*_machine_lines remain worker participation/credit rows and link to the event.

CREATE TABLE IF NOT EXISTS machine_production_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  machine_id BIGINT NOT NULL,
  machine_code VARCHAR(100) NOT NULL,
  product_code VARCHAR(255) NOT NULL,
  work_date DATE NOT NULL,
  shift VARCHAR(20) NOT NULL,

  physical_ok_quantity BIGINT NOT NULL DEFAULT 0,
  physical_ng_quantity BIGINT NOT NULL DEFAULT 0,
  physical_counted_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  physical_total_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  machine_time_hours DECIMAL(12,4) NOT NULL DEFAULT 0,
  maximum_output DECIMAL(18,6) NOT NULL DEFAULT 0,

  standard_output DECIMAL(18,6) NOT NULL,
  standard_version_id BIGINT NULL,
  machine_standard_id BIGINT NULL,
  standard_source VARCHAR(20) NULL,
  exclude_kqd_from_tt_snapshot TINYINT(1) NOT NULL,

  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by BIGINT NOT NULL,
  updated_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_mpe_machine_shift (process_id, machine_id, work_date, shift, status),
  KEY idx_mpe_product_date (process_id, product_code, work_date),
  KEY idx_mpe_standard_identity (standard_version_id, machine_standard_id),
  KEY idx_mpe_created_by (created_by, created_at)
);

CREATE TABLE IF NOT EXISTS machine_production_event_defects (
  id BIGINT NOT NULL AUTO_INCREMENT,
  machine_event_id BIGINT NOT NULL,
  defect_type_id BIGINT NULL,
  defect_code VARCHAR(100) NOT NULL,
  defect_name VARCHAR(255) NULL,
  quantity BIGINT NOT NULL DEFAULT 0,
  responsible_worker_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_mped_event_code_worker (machine_event_id, defect_code, responsible_worker_id),
  KEY idx_mped_event (machine_event_id),
  KEY idx_mped_responsible_worker (responsible_worker_id, machine_event_id),
  KEY idx_mped_defect_code (defect_code)
);

ALTER TABLE production_temp_machine_lines
  ADD COLUMN IF NOT EXISTS machine_event_id BIGINT NULL AFTER temp_report_id;

ALTER TABLE production_report_machine_lines
  ADD COLUMN IF NOT EXISTS machine_event_id BIGINT NULL AFTER report_id;

CREATE INDEX IF NOT EXISTS idx_ptml_machine_event
  ON production_temp_machine_lines (machine_event_id);
CREATE INDEX IF NOT EXISTS idx_prml_machine_event
  ON production_report_machine_lines (machine_event_id);
