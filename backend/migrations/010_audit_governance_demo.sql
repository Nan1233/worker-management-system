-- KTC demo hardening: audit/version history and governance support tables.
-- Safe on existing databases because every object is CREATE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NULL,
  entity_id VARCHAR(100) NULL,
  description VARCHAR(500) NULL,
  metadata_json JSON NULL,
  ip_address VARCHAR(80) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_created_at (created_at),
  KEY idx_activity_user (user_id, created_at),
  KEY idx_activity_entity (entity_type, entity_id, created_at),
  KEY idx_activity_action (action, created_at)
);

CREATE TABLE IF NOT EXISTS report_versions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_type VARCHAR(20) NOT NULL,
  report_id BIGINT NOT NULL,
  version_no INT NOT NULL,
  snapshot_json JSON NOT NULL,
  change_reason VARCHAR(500) NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_version (report_type, report_id, version_no),
  KEY idx_report_version_lookup (report_type, report_id, created_at),
  KEY idx_report_version_creator (created_by, created_at)
);

CREATE TABLE IF NOT EXISTS reporting_period_locks (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_year INT NOT NULL,
  report_month INT NOT NULL,
  process_id BIGINT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'locked',
  reason VARCHAR(500) NULL,
  locked_by BIGINT NULL,
  locked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unlocked_by BIGINT NULL,
  unlocked_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reporting_period_lock (report_year, report_month, process_id),
  KEY idx_reporting_period_status (status, report_year, report_month),
  KEY idx_reporting_period_process (process_id)
);

CREATE TABLE IF NOT EXISTS production_plans (
  id BIGINT NOT NULL AUTO_INCREMENT,
  plan_date DATE NOT NULL,
  shift VARCHAR(20) NULL,
  process_id BIGINT NOT NULL,
  machine_id BIGINT NULL,
  product_code VARCHAR(120) NOT NULL,
  planned_quantity DECIMAL(18,3) NOT NULL DEFAULT 0,
  planned_minutes DECIMAL(12,3) NOT NULL DEFAULT 0,
  planned_workers DECIMAL(10,2) NOT NULL DEFAULT 0,
  priority INT NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  note VARCHAR(500) NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_production_plans_date (plan_date, process_id),
  KEY idx_production_plans_status (status, plan_date)
);

CREATE TABLE IF NOT EXISTS report_validation_results (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_type VARCHAR(20) NOT NULL DEFAULT 'approved',
  report_id BIGINT NOT NULL,
  rule_code VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  message VARCHAR(500) NOT NULL,
  details_json JSON NULL,
  resolved TINYINT(1) NOT NULL DEFAULT 0,
  resolved_by BIGINT NULL,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_validation_open (resolved, severity, created_at),
  KEY idx_validation_report (report_type, report_id)
);

CREATE TABLE IF NOT EXISTS product_standard_versions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  product_code VARCHAR(120) NOT NULL,
  standard_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
  version_no INT NOT NULL DEFAULT 1,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_standard_version_lookup (process_id, product_code, effective_from, effective_to),
  KEY idx_standard_version_status (status, effective_from)
);

CREATE TABLE IF NOT EXISTS production_report_snapshots (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  snapshot_type VARCHAR(30) NOT NULL,
  standard_version_id BIGINT NULL,
  calculation_version VARCHAR(40) NULL,
  snapshot_data JSON NOT NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_snapshot (report_id, snapshot_type),
  KEY idx_report_snapshot_created (created_at)
);

CREATE TABLE IF NOT EXISTS production_formula_setting_versions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  scope_code VARCHAR(30) NOT NULL,
  process_id BIGINT NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  settings_json JSON NOT NULL,
  source_version_no INT NOT NULL,
  change_reason VARCHAR(500) NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_formula_history_scope (scope_code, created_at),
  KEY idx_formula_history_process (process_id, created_at)
);

-- production_reports historically used an ENUM without 'deleted'.
-- Soft-delete/version restore needs one additional lifecycle state.
ALTER TABLE production_reports
  MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'approved';
