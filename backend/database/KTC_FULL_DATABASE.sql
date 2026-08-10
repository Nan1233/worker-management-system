
-- ============================================================
-- FILE: 001_core_master_schema.sql
-- ============================================================
-- KTC 001: Khởi tạo các bảng master lõi. An toàn khi chạy trên DB đã có dữ liệu.
CREATE TABLE IF NOT EXISTS users (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(120) NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'worker',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  KEY idx_users_role_status (role, status)
);

CREATE TABLE IF NOT EXISTS processes (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_code VARCHAR(50) NOT NULL,
  process_name VARCHAR(180) NOT NULL,
  description VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_process_code (process_code),
  KEY idx_process_status (status, process_name)
);

CREATE TABLE IF NOT EXISTS workers (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  worker_code VARCHAR(100) NOT NULL,
  phone VARCHAR(40) NULL,
  department VARCHAR(120) NULL DEFAULT 'Sản xuất',
  position VARCHAR(120) NULL DEFAULT 'Công nhân',
  training_percent DECIMAL(7,2) NOT NULL DEFAULT 100,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_workers_user (user_id),
  UNIQUE KEY uq_workers_code (worker_code),
  KEY idx_workers_status_code (status, worker_code)
);

CREATE TABLE IF NOT EXISTS worker_processes (
  worker_id BIGINT NOT NULL,
  process_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (worker_id, process_id),
  KEY idx_worker_process_process (process_id, worker_id)
);

CREATE TABLE IF NOT EXISTS manager_processes (
  manager_id BIGINT NOT NULL,
  process_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (manager_id, process_id),
  KEY idx_manager_process_process (process_id, manager_id)
);

CREATE TABLE IF NOT EXISTS machines (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  machine_code VARCHAR(120) NOT NULL,
  machine_name VARCHAR(255) NOT NULL,
  exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_machine_process_code (process_id, machine_code),
  KEY idx_machine_process_status (process_id, status)
);

CREATE TABLE IF NOT EXISTS product_standards (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  work_type VARCHAR(180) NOT NULL DEFAULT '',
  product_code VARCHAR(180) NOT NULL,
  standard_output DECIMAL(18,6) NOT NULL,
  exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_standard (process_id, product_code),
  KEY idx_product_standard_status (process_id, status, product_code)
);

CREATE TABLE IF NOT EXISTS product_machine_standards (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  product_code VARCHAR(180) NOT NULL,
  machine_id BIGINT NOT NULL,
  standard_output DECIMAL(18,6) NOT NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_machine_standard (process_id, product_code, machine_id, effective_from),
  KEY idx_product_machine_active (process_id, product_code, machine_id, is_active)
);

CREATE TABLE IF NOT EXISTS defect_types (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  defect_code VARCHAR(100) NOT NULL,
  defect_name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_defect_process_code (process_id, defect_code),
  KEY idx_defect_process_status (process_id, status, sort_order)
);

CREATE TABLE IF NOT EXISTS deduction_types (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  deduction_code VARCHAR(100) NOT NULL,
  deduction_name VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_deduction_process_code (process_id, deduction_code),
  KEY idx_deduction_process_status (process_id, status, sort_order)
);


-- ============================================================
-- FILE: 002_production_schema.sql
-- ============================================================
-- KTC 002: Bảng báo cáo sản xuất lõi.
CREATE TABLE IF NOT EXISTS production_reports_temp (
  id BIGINT NOT NULL AUTO_INCREMENT,
  worker_id BIGINT NOT NULL,
  process_id BIGINT NOT NULL,
  work_date DATE NOT NULL,
  shift VARCHAR(20) NOT NULL,
  operation_type VARCHAR(40) NULL,
  operation_mode VARCHAR(40) NULL,
  machine_no VARCHAR(100) NULL,
  product_name VARCHAR(255) NULL,
  total_time DECIMAL(12,4) NOT NULL DEFAULT 0,
  actual_time DECIMAL(12,4) NOT NULL DEFAULT 0,
  deduction_time DECIMAL(12,4) NOT NULL DEFAULT 0,
  standard_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  actual_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  tt_ok BIGINT NOT NULL DEFAULT 0,
  tt_ng BIGINT NOT NULL DEFAULT 0,
  kqd_dap_lai BIGINT NOT NULL DEFAULT 0,
  kqd_tuot BIGINT NOT NULL DEFAULT 0,
  vo_do_long BIGINT NOT NULL DEFAULT 0,
  xuoc_do_long BIGINT NOT NULL DEFAULT 0,
  cong_gay BIGINT NOT NULL DEFAULT 0,
  xoay BIGINT NOT NULL DEFAULT 0,
  khong_dut BIGINT NOT NULL DEFAULT 0,
  bavia_hut BIGINT NOT NULL DEFAULT 0,
  ppcm BIGINT NOT NULL DEFAULT 0,
  loi_cao_su BIGINT NOT NULL DEFAULT 0,
  ng_kich_thuoc BIGINT NOT NULL DEFAULT 0,
  cat_lem BIGINT NOT NULL DEFAULT 0,
  note TEXT NULL,
  client_request_id VARCHAR(120) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  review_note TEXT NULL,
  reviewed_by BIGINT NULL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_prt_worker_date (worker_id, work_date),
  KEY idx_prt_process_date (process_id, work_date, status),
  KEY idx_prt_status_created (status, created_at)
);

CREATE TABLE IF NOT EXISTS production_reports (
  id BIGINT NOT NULL AUTO_INCREMENT,
  source_temp_id BIGINT NULL,
  worker_id BIGINT NOT NULL,
  process_id BIGINT NOT NULL,
  work_date DATE NOT NULL,
  shift VARCHAR(20) NOT NULL,
  operation_type VARCHAR(40) NULL,
  operation_mode VARCHAR(40) NULL,
  machine_no VARCHAR(100) NULL,
  product_name VARCHAR(255) NULL,
  total_time DECIMAL(12,4) NOT NULL DEFAULT 0,
  actual_time DECIMAL(12,4) NOT NULL DEFAULT 0,
  deduction_time DECIMAL(12,4) NOT NULL DEFAULT 0,
  standard_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  actual_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  tt_ok BIGINT NOT NULL DEFAULT 0,
  tt_ng BIGINT NOT NULL DEFAULT 0,
  kqd_dap_lai BIGINT NOT NULL DEFAULT 0,
  kqd_tuot BIGINT NOT NULL DEFAULT 0,
  vo_do_long BIGINT NOT NULL DEFAULT 0,
  xuoc_do_long BIGINT NOT NULL DEFAULT 0,
  cong_gay BIGINT NOT NULL DEFAULT 0,
  xoay BIGINT NOT NULL DEFAULT 0,
  khong_dut BIGINT NOT NULL DEFAULT 0,
  bavia_hut BIGINT NOT NULL DEFAULT 0,
  ppcm BIGINT NOT NULL DEFAULT 0,
  loi_cao_su BIGINT NOT NULL DEFAULT 0,
  ng_kich_thuoc BIGINT NOT NULL DEFAULT 0,
  cat_lem BIGINT NOT NULL DEFAULT 0,
  note TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'approved',
  review_note TEXT NULL,
  reviewed_by BIGINT NULL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_source_temp (source_temp_id),
  KEY idx_pr_worker_date (worker_id, work_date),
  KEY idx_pr_process_date (process_id, work_date, status)
);

CREATE TABLE IF NOT EXISTS production_temp_defects (
  id BIGINT NOT NULL AUTO_INCREMENT,
  temp_report_id BIGINT NOT NULL,
  defect_type_id BIGINT NOT NULL,
  quantity BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_temp_defect_report (temp_report_id),
  KEY idx_temp_defect_type (defect_type_id)
);

CREATE TABLE IF NOT EXISTS production_report_defects (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  defect_type_id BIGINT NOT NULL,
  quantity BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_report_defect_report (report_id),
  KEY idx_report_defect_type (defect_type_id)
);

CREATE TABLE IF NOT EXISTS production_temp_deductions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  temp_report_id BIGINT NOT NULL,
  deduction_type_id BIGINT NOT NULL,
  hours DECIMAL(12,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_temp_deduction_report (temp_report_id),
  KEY idx_temp_deduction_type (deduction_type_id)
);

CREATE TABLE IF NOT EXISTS production_report_deductions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  deduction_type_id BIGINT NOT NULL,
  hours DECIMAL(12,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_report_deduction_report (report_id),
  KEY idx_report_deduction_type (deduction_type_id)
);

CREATE TABLE IF NOT EXISTS report_action_logs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_type VARCHAR(20) NOT NULL,
  report_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  action VARCHAR(80) NOT NULL,
  note TEXT NULL,
  ip_address VARCHAR(80) NULL,
  user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_report_action_report (report_type, report_id, created_at),
  KEY idx_report_action_user (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS report_edit_logs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_type VARCHAR(20) NOT NULL DEFAULT 'temp',
  report_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  old_data JSON NULL,
  new_data JSON NULL,
  changed_fields JSON NULL,
  note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_report_edit_report (report_type, report_id, created_at)
);


-- ============================================================
-- FILE: 003_machine_and_session_schema.sql
-- ============================================================
-- KTC 003: Chi tiết nhiều máy, phiên đăng nhập và thông báo.
CREATE TABLE IF NOT EXISTS production_temp_machine_lines (
  id BIGINT NOT NULL AUTO_INCREMENT,
  temp_report_id BIGINT NOT NULL,
  machine_id BIGINT NULL,
  machine_code VARCHAR(100) NOT NULL,
  product_standard_id BIGINT NULL,
  product_code VARCHAR(255) NOT NULL,
  machine_time_hours DECIMAL(12,4) NOT NULL DEFAULT 0,
  standard_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  standard_source VARCHAR(20) NULL,
  exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
  ok_quantity BIGINT NOT NULL DEFAULT 0,
  ng_quantity BIGINT NOT NULL DEFAULT 0,
  maximum_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  deduction_time_hours DECIMAL(12,4) NOT NULL DEFAULT 0,
  deductions_json JSON NULL,
  counted_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  earned_standard_hours DECIMAL(18,6) NOT NULL DEFAULT 0,
  defects_json JSON NULL,
  sort_order TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_temp_report_machine (temp_report_id, machine_code),
  KEY idx_temp_machine_report (temp_report_id)
);

CREATE TABLE IF NOT EXISTS production_report_machine_lines (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  machine_id BIGINT NULL,
  machine_code VARCHAR(100) NOT NULL,
  product_standard_id BIGINT NULL,
  product_code VARCHAR(255) NOT NULL,
  machine_time_hours DECIMAL(12,4) NOT NULL DEFAULT 0,
  standard_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  standard_source VARCHAR(20) NULL,
  exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
  ok_quantity BIGINT NOT NULL DEFAULT 0,
  ng_quantity BIGINT NOT NULL DEFAULT 0,
  maximum_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  deduction_time_hours DECIMAL(12,4) NOT NULL DEFAULT 0,
  deductions_json JSON NULL,
  counted_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  earned_standard_hours DECIMAL(18,6) NOT NULL DEFAULT 0,
  defects_json JSON NULL,
  sort_order TINYINT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_machine (report_id, machine_code),
  KEY idx_machine_report (report_id)
);

CREATE TABLE IF NOT EXISTS production_temp_machine_defects (
  id BIGINT NOT NULL AUTO_INCREMENT,
  machine_line_id BIGINT NOT NULL,
  defect_type_id BIGINT NULL,
  defect_code VARCHAR(100) NOT NULL,
  defect_name VARCHAR(255) NULL,
  quantity BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_temp_machine_defect (machine_line_id, defect_code),
  KEY idx_temp_machine_defects_code (defect_code)
);

CREATE TABLE IF NOT EXISTS production_report_machine_defects (
  id BIGINT NOT NULL AUTO_INCREMENT,
  machine_line_id BIGINT NOT NULL,
  defect_type_id BIGINT NULL,
  defect_code VARCHAR(100) NOT NULL,
  defect_name VARCHAR(255) NULL,
  quantity BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_machine_defect (machine_line_id, defect_code),
  KEY idx_report_machine_defects_code (defect_code)
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  user_agent VARCHAR(500) NULL,
  ip_address VARCHAR(80) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_session_user (user_id, revoked_at, expires_at)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  type VARCHAR(80) NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NULL,
  data_json JSON NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_notification_user (user_id, is_read, created_at)
);


-- ============================================================
-- FILE: 004_sync_and_export_schema.sql
-- ============================================================
-- KTC 004: Đồng bộ Excel, Google Sheet, hàng đợi và dữ liệu hỗ trợ.
CREATE TABLE IF NOT EXISTS excel_sync_batches (
  id BIGINT NOT NULL AUTO_INCREMENT,
  source_file VARCHAR(500) NULL,
  source_sha256 CHAR(64) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  summary_json JSON NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_excel_sync_batch_status (status, created_at)
);

CREATE TABLE IF NOT EXISTS excel_sync_logs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  batch_id BIGINT NOT NULL,
  entity_type VARCHAR(80) NULL,
  source_sheet VARCHAR(150) NULL,
  source_row_number INT NULL,
  action VARCHAR(30) NULL,
  old_data JSON NULL,
  new_data JSON NULL,
  changed_fields JSON NULL,
  message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_excel_sync_log_batch (batch_id, id)
);

CREATE TABLE IF NOT EXISTS excel_export_jobs (
  id VARCHAR(36) NOT NULL,
  job_type VARCHAR(32) NOT NULL,
  payload_json JSON NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  result_json JSON NULL,
  error_message TEXT NULL,
  metrics_json JSON NULL,
  requested_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  next_attempt_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_excel_jobs_status_next (status, next_attempt_at, created_at),
  KEY idx_excel_jobs_created (created_at)
);

CREATE TABLE IF NOT EXISTS integration_sync_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  job_type VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  payload_json JSON NULL,
  result_json JSON NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_integration_jobs_status (status, created_at)
);

CREATE TABLE IF NOT EXISTS google_sheets (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NULL,
  sheet_id VARCHAR(255) NOT NULL,
  sheet_name VARCHAR(255) NULL,
  range_name VARCHAR(255) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_google_sheet_process (process_id, status)
);


-- ============================================================
-- FILE: 005_entry_date_compatibility.sql
-- ============================================================
ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS entry_date DATE NULL AFTER work_date;
ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS entry_date DATE NULL AFTER work_date;
UPDATE production_reports
SET entry_date = COALESCE(DATE(created_at), work_date)
WHERE entry_date IS NULL;
UPDATE production_reports_temp
SET entry_date = COALESCE(DATE(created_at), work_date)
WHERE entry_date IS NULL;


-- ============================================================
-- FILE: 006_extra_data_compatibility.sql
-- ============================================================
ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS extra_data JSON NULL AFTER note;
ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS extra_data JSON NULL AFTER note;


-- ============================================================
-- FILE: 007_production_formula_settings.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS production_formula_settings (
  scope_code VARCHAR(30) NOT NULL,
  process_id BIGINT NULL,
  apply_training_percent TINYINT(1) NOT NULL DEFAULT 1,
  output_formula VARCHAR(50) NOT NULL DEFAULT 'ENTERED_X_TRAINING',
  output_per_hour_formula VARCHAR(60) NOT NULL DEFAULT 'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME',
  achievement_formula VARCHAR(60) NOT NULL DEFAULT 'OUTPUT_PER_HOUR_DIV_STANDARD',
  ng_rate_formula VARCHAR(50) NOT NULL DEFAULT 'NG_DIV_OK_PLUS_NG',
  actual_time_formula VARCHAR(40) NOT NULL DEFAULT 'DATABASE_SNAPSHOT',
  threshold_red DECIMAL(7,2) NOT NULL DEFAULT 80,
  threshold_orange DECIMAL(7,2) NOT NULL DEFAULT 95,
  threshold_yellow DECIMAL(7,2) NOT NULL DEFAULT 100,
  threshold_green DECIMAL(7,2) NOT NULL DEFAULT 110,
  version_no INT NOT NULL DEFAULT 1,
  updated_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (scope_code),
  KEY idx_formula_process_id (process_id)
);
INSERT IGNORE INTO production_formula_settings (scope_code, process_id) VALUES ('GLOBAL', NULL);


-- ============================================================
-- FILE: 008_client_request_idempotency.sql
-- ============================================================
-- Enforce idempotency at the database layer. If duplicate non-empty request IDs
-- already exist, this migration intentionally fails so they can be reviewed
-- instead of silently deleting production data.
CREATE UNIQUE INDEX uq_prt_worker_client_request
  ON production_reports_temp (worker_id, client_request_id);


-- ============================================================
-- FILE: 009_role_permissions.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS role_permission_overrides (
  role VARCHAR(20) NOT NULL,
  permission_code VARCHAR(80) NOT NULL,
  allowed TINYINT(1) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role, permission_code)
);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id BIGINT NOT NULL,
  permission_code VARCHAR(80) NOT NULL,
  allowed TINYINT(1) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_code),
  INDEX idx_user_permission_user (user_id)
);


-- ============================================================
-- FILE: 010_audit_governance_demo.sql
-- ============================================================
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


-- ============================================================
-- FILE: 011_master_seed_support.sql
-- ============================================================
-- Hạ tầng seed dữ liệu gốc KTC từ file mẫu.
CREATE TABLE IF NOT EXISTS master_seed_runs (
  seed_key VARCHAR(120) NOT NULL PRIMARY KEY,
  source_file VARCHAR(255) NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  summary_json JSON NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_aliases (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  process_id BIGINT NOT NULL,
  alias_code VARCHAR(160) NOT NULL,
  product_code VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_alias (process_id, alias_code),
  KEY idx_product_alias_product (process_id, product_code)
);

CREATE TABLE IF NOT EXISTS product_standard_variants (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  process_id BIGINT NOT NULL,
  work_type VARCHAR(180) NOT NULL DEFAULT '',
  product_code VARCHAR(180) NOT NULL,
  standard_output DECIMAL(18,6) NOT NULL,
  exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
  source_sheet VARCHAR(120) NULL,
  source_row INT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_standard_variant (process_id, work_type, product_code),
  KEY idx_standard_variant_product (process_id, product_code)
);

