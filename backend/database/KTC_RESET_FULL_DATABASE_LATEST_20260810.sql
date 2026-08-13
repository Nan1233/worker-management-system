-- ============================================================================
-- KTC - FULL DATABASE TỪ ĐẦU - TIDB SAFE - 10/08/2026
-- CẢNH BÁO: FILE NÀY XÓA TOÀN BỘ DATABASE worker_management VÀ TẠO LẠI.
-- ĐÃ TÍCH HỢP TRỰC TIẾP SCHEMA CUỐI, MASTER DATA, BOOK2 VÀ TÀI KHOẢN HỆ THỐNG.
-- KHÔNG CÒN CÁC ALTER TABLE ADD COLUMN IF NOT EXISTS DÙNG CHO NÂNG CẤP DB CŨ.
-- ============================================================================

DROP DATABASE IF EXISTS worker_management;
CREATE DATABASE worker_management CHARACTER SET utf8mb4;
USE worker_management;

-- ============================================================================
-- KTC FULL DATABASE WITH DATA - ĐỒNG BỘ VỚI SOURCE CODE 10/08/2026
-- Dùng cho TiDB/MySQL compatible.
-- KHÔNG DROP DATABASE / DROP TABLE / TRUNCATE.
-- Thứ tự: schema 001-011 -> master seed -> rule 012 -> Book2 013 -> checksum.
-- ============================================================================


-- ==================== 001_core_master_schema.sql ====================
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
  is_automatic TINYINT(1) NOT NULL DEFAULT 0,
  max_workers_per_machine INT NOT NULL DEFAULT 1,
  output_basis VARCHAR(20) NOT NULL DEFAULT 'PRODUCT',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_machine_process_code (process_id, machine_code),
  KEY idx_machine_process_status (process_id, status),
  KEY idx_machines_factory_policy (process_id, status, is_automatic, max_workers_per_machine, output_basis)
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
  standard_time_seconds DECIMAL(18,6) NULL,
  calculated_output_per_hour DECIMAL(18,6) NULL,
  source_name VARCHAR(120) NULL,
  source_row_number INT NULL,
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

-- ==================== 002_production_schema.sql ====================
-- KTC 002: Bảng báo cáo sản xuất lõi.
CREATE TABLE IF NOT EXISTS production_reports_temp (
  id BIGINT NOT NULL AUTO_INCREMENT,
  worker_id BIGINT NOT NULL,
  process_id BIGINT NOT NULL,
  work_date DATE NOT NULL,
  entry_date DATE NULL,
  shift VARCHAR(20) NOT NULL,
  operation_type VARCHAR(40) NULL,
  operation_mode VARCHAR(40) NULL,
  machine_no VARCHAR(100) NULL,
  product_name VARCHAR(255) NULL,
  total_time DECIMAL(12,4) NOT NULL DEFAULT 0,
  actual_time DECIMAL(12,4) NOT NULL DEFAULT 0,
  deduction_time DECIMAL(12,4) NOT NULL DEFAULT 0,
  standard_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  standard_version_id BIGINT NULL,
  machine_standard_id BIGINT NULL,
  training_percent_snapshot DECIMAL(7,2) NULL,
  exclude_kqd_from_tt_snapshot TINYINT(1) NULL,
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
  extra_data JSON NULL,
  client_request_id VARCHAR(120) NULL,
  logical_duplicate_key CHAR(64) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  review_note TEXT NULL,
  reviewed_by BIGINT NULL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_prt_worker_date (worker_id, work_date),
  KEY idx_prt_process_date (process_id, work_date, status),
  KEY idx_prt_status_created (status, created_at),
  KEY idx_prt_review_queue (status, process_id, work_date, updated_at),
  KEY idx_prt_standard_version (standard_version_id),
  KEY idx_prt_logical_duplicate_status (logical_duplicate_key, status, worker_id, process_id, work_date, shift)
);


CREATE TABLE IF NOT EXISTS production_report_duplicate_locks (
  logical_key CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (logical_key)
);

CREATE TABLE IF NOT EXISTS production_reports (
  id BIGINT NOT NULL AUTO_INCREMENT,
  source_temp_id BIGINT NULL,
  worker_id BIGINT NOT NULL,
  process_id BIGINT NOT NULL,
  work_date DATE NOT NULL,
  entry_date DATE NULL,
  shift VARCHAR(20) NOT NULL,
  operation_type VARCHAR(40) NULL,
  operation_mode VARCHAR(40) NULL,
  machine_no VARCHAR(100) NULL,
  product_name VARCHAR(255) NULL,
  total_time DECIMAL(12,4) NOT NULL DEFAULT 0,
  actual_time DECIMAL(12,4) NOT NULL DEFAULT 0,
  deduction_time DECIMAL(12,4) NOT NULL DEFAULT 0,
  standard_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  standard_version_id BIGINT NULL,
  machine_standard_id BIGINT NULL,
  training_percent_snapshot DECIMAL(7,2) NULL,
  exclude_kqd_from_tt_snapshot TINYINT(1) NULL,
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
  extra_data JSON NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'approved',
  review_note TEXT NULL,
  reviewed_by BIGINT NULL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_production_source_temp (source_temp_id),
  KEY idx_pr_worker_date (worker_id, work_date),
  KEY idx_pr_process_date (process_id, work_date, status),
  KEY idx_pr_standard_version (standard_version_id),
  KEY idx_pr_approved_export (status, process_id, work_date, approved_at)
);

CREATE TABLE IF NOT EXISTS production_temp_defects (
  id BIGINT NOT NULL AUTO_INCREMENT,
  temp_report_id BIGINT NOT NULL,
  defect_type_id BIGINT NOT NULL,
  quantity BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_temp_defect_once (temp_report_id, defect_type_id),
  KEY idx_temp_defect_report (temp_report_id),
  KEY idx_temp_defect_type (defect_type_id)
);

CREATE TABLE IF NOT EXISTS production_report_defects (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  defect_type_id BIGINT NOT NULL,
  quantity BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_defect_once (report_id, defect_type_id),
  KEY idx_report_defect_report (report_id),
  KEY idx_report_defect_type (defect_type_id)
);

CREATE TABLE IF NOT EXISTS production_temp_deductions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  temp_report_id BIGINT NOT NULL,
  deduction_type_id BIGINT NOT NULL,
  hours DECIMAL(12,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_temp_deduction_once (temp_report_id, deduction_type_id),
  KEY idx_temp_deduction_report (temp_report_id),
  KEY idx_temp_deduction_type (deduction_type_id)
);

CREATE TABLE IF NOT EXISTS production_report_deductions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  deduction_type_id BIGINT NOT NULL,
  hours DECIMAL(12,4) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_report_deduction_once (report_id, deduction_type_id),
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

-- ==================== 003_machine_and_session_schema.sql ====================
-- KTC 003: Chi tiết nhiều máy, phiên đăng nhập và thông báo.
CREATE TABLE IF NOT EXISTS production_temp_machine_lines (
  id BIGINT NOT NULL AUTO_INCREMENT,
  temp_report_id BIGINT NOT NULL,
  machine_event_id BIGINT NULL,
  machine_id BIGINT NULL,
  machine_code VARCHAR(100) NOT NULL,
  product_standard_id BIGINT NULL,
  standard_version_id BIGINT NULL,
  machine_standard_id BIGINT NULL,
  product_code VARCHAR(255) NOT NULL,
  machine_time_hours DECIMAL(12,4) NOT NULL DEFAULT 0,
  standard_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  standard_time_seconds DECIMAL(18,6) NULL,
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
  KEY idx_temp_machine_report (temp_report_id),
  KEY idx_ptml_machine_event (machine_event_id),
  KEY idx_ptml_standard_identity (standard_version_id, machine_standard_id)
);

CREATE TABLE IF NOT EXISTS production_report_machine_lines (
  id BIGINT NOT NULL AUTO_INCREMENT,
  report_id BIGINT NOT NULL,
  machine_event_id BIGINT NULL,
  machine_id BIGINT NULL,
  machine_code VARCHAR(100) NOT NULL,
  product_standard_id BIGINT NULL,
  standard_version_id BIGINT NULL,
  machine_standard_id BIGINT NULL,
  product_code VARCHAR(255) NOT NULL,
  machine_time_hours DECIMAL(12,4) NOT NULL DEFAULT 0,
  standard_output DECIMAL(18,6) NOT NULL DEFAULT 0,
  standard_time_seconds DECIMAL(18,6) NULL,
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
  KEY idx_machine_report (report_id),
  KEY idx_prml_machine_event (machine_event_id),
  KEY idx_prml_standard_identity (standard_version_id, machine_standard_id)
);

-- ==================== 022_shared_machine_accounting_20260812.sql ====================
-- Physical machine truth for shared-machine accounting. Worker credit remains on report machine lines.
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
  refresh_token VARCHAR(255) NULL,
  refresh_token_hash VARCHAR(255) NULL,
  family_id VARCHAR(64) NULL,
  device_id VARCHAR(64) NULL,
  device_name VARCHAR(255) NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  consumed_at DATETIME NULL,
  replaced_by_id BIGINT NULL,
  reuse_detected_at DATETIME NULL,
  user_agent VARCHAR(500) NULL,
  ip_address VARCHAR(80) NULL,
  last_used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_session_user (user_id, revoked_at, expires_at),
  UNIQUE KEY uq_session_refresh_token (refresh_token),
  KEY idx_session_family (family_id, revoked_at, expires_at),
  KEY idx_session_replaced_by (replaced_by_id),
  KEY idx_session_expiry (expires_at, revoked_at)
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

-- ==================== 004_sync_and_export_schema.sql ====================
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
  job_key VARCHAR(191) NULL,
  work_date DATE NULL,
  report_month CHAR(7) NULL,
  process_id BIGINT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  next_retry_at DATETIME NULL,
  locked_at DATETIME NULL,
  last_error TEXT NULL,
  completed_at DATETIME NULL,
  result_url TEXT NULL,
  payload_json JSON NULL,
  result_json JSON NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_integration_jobs_type_key (job_type, job_key),
  KEY idx_integration_jobs_status (status, created_at),
  KEY idx_integration_jobs_ready (status, next_retry_at, locked_at, created_at)
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

-- ==================== 005_entry_date_compatibility.sql ====================
UPDATE production_reports
SET entry_date = COALESCE(DATE(created_at), work_date)
WHERE entry_date IS NULL;
UPDATE production_reports_temp
SET entry_date = COALESCE(DATE(created_at), work_date)
WHERE entry_date IS NULL;

-- ==================== 006_extra_data_compatibility.sql ====================

-- ==================== 007_production_formula_settings.sql ====================
CREATE TABLE IF NOT EXISTS production_formula_settings (
  scope_code VARCHAR(30) NOT NULL,
  process_id BIGINT NULL,
  effective_from DATE NULL,
  effective_to DATE NULL,
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

-- ==================== 008_client_request_idempotency.sql ====================
-- Enforce idempotency at the database layer. If duplicate non-empty request IDs
-- already exist, this migration intentionally fails so they can be reviewed
-- instead of silently deleting production data.
CREATE UNIQUE INDEX uq_prt_worker_client_request
  ON production_reports_temp (worker_id, client_request_id);

-- ==================== 009_role_permissions.sql ====================
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

-- ==================== 010_audit_governance_demo.sql ====================
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

-- ==================== 011_master_seed_support.sql ====================
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

-- ==================== MASTER DATA SNAPSHOT ====================
-- ============================================================================
-- 1. CÔNG ĐOẠN
-- ============================================================================
INSERT INTO processes (process_code, process_name, description, status) VALUES
  ('GC', 'Cắt/Lồng', 'Gia công cắt và lồng', 'active'),
  ('MAI', 'Mài', 'Công đoạn mài', 'active'),
  ('DO', 'Đo', 'Công đoạn đo', 'active'),
  ('K1', 'Kiểm 1', 'Công đoạn kiểm 1', 'active'),
  ('K2', 'Kiểm 2', 'Công đoạn kiểm 2', 'active'),
  ('XLBV', 'Xử lý bavia', 'Xử lý bavia', 'active'),
  ('EP', 'Ép', 'Công đoạn ép', 'active'),
  ('CAN', 'Cán', 'Công đoạn cán', 'active'),
  ('SX3', 'Sản xuất 3', 'Sản xuất 3 / lắp ráp', 'active')
ON DUPLICATE KEY UPDATE process_name=VALUES(process_name), description=VALUES(description), status='active';

-- ============================================================================
-- 2. MÁY
-- ============================================================================
INSERT INTO machines (process_id, machine_code, machine_name, status)
SELECT p.id, s.machine_code, s.machine_name, 'active'
FROM (
SELECT 'GC' AS `process_code`, 'C1' AS `machine_code`, 'c1' AS `machine_name`, 'active' AS `status`
UNION ALL
SELECT 'GC', 'C2', 'c2', 'active'
UNION ALL
SELECT 'GC', 'C3', 'c3', 'active'
UNION ALL
SELECT 'GC', 'C4', 'c4', 'active'
UNION ALL
SELECT 'GC', 'C8', 'c8', 'active'
UNION ALL
SELECT 'GC', 'C9', 'c9', 'active'
UNION ALL
SELECT 'GC', 'C11', 'c11', 'active'
UNION ALL
SELECT 'GC', 'C12', 'c12', 'active'
UNION ALL
SELECT 'GC', 'C13', 'c13', 'active'
UNION ALL
SELECT 'GC', 'C5', 'c5', 'active'
UNION ALL
SELECT 'GC', 'C6', 'c6', 'active'
UNION ALL
SELECT 'GC', 'C7', 'c7', 'active'
UNION ALL
SELECT 'GC', '1', '1', 'active'
UNION ALL
SELECT 'GC', '2', '2', 'active'
UNION ALL
SELECT 'GC', '3', '3', 'active'
UNION ALL
SELECT 'GC', '4', '4', 'active'
UNION ALL
SELECT 'GC', '5', '5', 'active'
UNION ALL
SELECT 'GC', '6', '6', 'active'
UNION ALL
SELECT 'GC', '7', '7', 'active'
UNION ALL
SELECT 'GC', '8', '8', 'active'
UNION ALL
SELECT 'GC', '9', '9', 'active'
UNION ALL
SELECT 'GC', '10', '10', 'active'
UNION ALL
SELECT 'GC', '11', '11', 'active'
UNION ALL
SELECT 'GC', '12', '12', 'active'
UNION ALL
SELECT 'GC', '14', '14', 'active'
UNION ALL
SELECT 'GC', '15', '15', 'active'
UNION ALL
SELECT 'GC', '16', '16', 'active'
UNION ALL
SELECT 'GC', '17', '17', 'active'
UNION ALL
SELECT 'GC', '18', '18', 'active'
UNION ALL
SELECT 'GC', '19', '19', 'active'
UNION ALL
SELECT 'GC', '20', '20', 'active'
UNION ALL
SELECT 'GC', '21', '21', 'active'
UNION ALL
SELECT 'GC', 'QC', 'QC', 'active'
UNION ALL
SELECT 'MAI', '1', '1', 'active'
UNION ALL
SELECT 'MAI', '2', '2', 'active'
UNION ALL
SELECT 'MAI', '3', '3', 'active'
UNION ALL
SELECT 'MAI', '4', '4', 'active'
UNION ALL
SELECT 'MAI', '5', '5', 'active'
UNION ALL
SELECT 'MAI', '6', '6', 'active'
UNION ALL
SELECT 'MAI', '7', '7', 'active'
UNION ALL
SELECT 'MAI', '8', '8', 'active'
UNION ALL
SELECT 'MAI', '9', '9', 'active'
UNION ALL
SELECT 'MAI', '10', '10', 'active'
UNION ALL
SELECT 'MAI', '11', '11', 'active'
UNION ALL
SELECT 'MAI', '12', '12', 'active'
UNION ALL
SELECT 'MAI', '13', '13', 'active'
UNION ALL
SELECT 'MAI', '14', '14', 'active'
UNION ALL
SELECT 'MAI', '15', '15', 'active'
UNION ALL
SELECT 'MAI', '16', '16', 'active'
UNION ALL
SELECT 'MAI', '17', '17', 'active'
UNION ALL
SELECT 'MAI', '18', '18', 'active'
UNION ALL
SELECT 'MAI', '19', '19', 'active'
UNION ALL
SELECT 'MAI', '20', '20', 'active'
UNION ALL
SELECT 'MAI', '21', '21', 'active'
UNION ALL
SELECT 'MAI', '22', '22', 'active'
UNION ALL
SELECT 'MAI', '23', '23', 'active'
UNION ALL
SELECT 'MAI', '24', '24', 'active'
UNION ALL
SELECT 'MAI', '25', '25', 'active'
UNION ALL
SELECT 'MAI', '26', '26', 'active'
UNION ALL
SELECT 'MAI', '27', '27', 'active'
UNION ALL
SELECT 'MAI', '28', '28', 'active'
UNION ALL
SELECT 'MAI', '29', '29', 'active'
UNION ALL
SELECT 'MAI', '30', '30', 'active'
UNION ALL
SELECT 'MAI', '31', '31', 'active'
UNION ALL
SELECT 'MAI', '32', '32', 'active'
UNION ALL
SELECT 'MAI', '33', '33', 'active'
UNION ALL
SELECT 'MAI', '34', '34', 'active'
UNION ALL
SELECT 'MAI', '35', '35', 'active'
UNION ALL
SELECT 'DO', '1', '1', 'active'
UNION ALL
SELECT 'DO', '2', '2', 'active'
UNION ALL
SELECT 'DO', '3', '3', 'active'
UNION ALL
SELECT 'DO', '4', '4', 'active'
UNION ALL
SELECT 'DO', '5', '5', 'active'
UNION ALL
SELECT 'DO', '6', '6', 'active'
UNION ALL
SELECT 'DO', '7', '7', 'active'
UNION ALL
SELECT 'DO', '8', '8', 'active'
UNION ALL
SELECT 'DO', '9', '9', 'active'
UNION ALL
SELECT 'DO', '10', '10', 'active'
UNION ALL
SELECT 'DO', '11', '11', 'active'
UNION ALL
SELECT 'DO', '12', '12', 'active'
UNION ALL
SELECT 'DO', '13', '13', 'active'
UNION ALL
SELECT 'DO', '14', '14', 'active'
UNION ALL
SELECT 'DO', '15', '15', 'active'
UNION ALL
SELECT 'DO', '16', '16', 'active'
UNION ALL
SELECT 'DO', '17', '17', 'active'
UNION ALL
SELECT 'DO', '18', '18', 'active'
UNION ALL
SELECT 'DO', '19', '19', 'active'
UNION ALL
SELECT 'DO', '20', '20', 'active'
UNION ALL
SELECT 'DO', '21', '21', 'active'
UNION ALL
SELECT 'DO', '22', '22', 'active'
UNION ALL
SELECT 'CAN', '16''''', '16''''', 'active'
UNION ALL
SELECT 'CAN', '14''''', '14''''', 'active'
UNION ALL
SELECT 'CAN', '10''''', '10''''', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 1', 'Press No 1', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 2', 'Press No 2', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 3', 'Press No 3', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 4', 'Press No 4', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 5', 'Press No 5', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 6', 'Press No 6', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 7', 'Press No 7', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 8', 'Press No 8', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 9', 'Press No 9', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 10', 'Press No 10', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 11', 'Press No 11', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 12', 'Press No 12', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 13', 'Press No 13', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 14', 'Press No 14', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 15', 'Press No 15', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 16', 'Press No 16', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 17', 'Press No 17', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 18', 'Press No 18', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 19', 'Press No 19', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 20', 'Press No 20', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 21', 'Press No 21', 'active'
UNION ALL
SELECT 'EP', 'PRESS NO 22', 'Press No 22', 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE machine_name=VALUES(machine_name), status='active' ;

-- ============================================================================
-- 3. ÁNH XẠ MÃ SẢN PHẨM
-- ============================================================================
INSERT INTO product_aliases (process_id, alias_code, product_code, status)
SELECT p.id, s.alias_code, s.product_code, 'active'
FROM (
SELECT 'XLBV' AS `process_code`, 'YYU' AS `alias_code`, 'D01YYU' AS `product_code`, 'active' AS `status`
UNION ALL
SELECT 'XLBV', 'YYU NGOÀI', 'D01YYU', 'active'
UNION ALL
SELECT 'XLBV', '8500', '194838500', 'active'
UNION ALL
SELECT 'XLBV', '696', 'QC7-0696', 'active'
UNION ALL
SELECT 'XLBV', '696 VIA', 'QC7-0696', 'active'
UNION ALL
SELECT 'XLBV', '6396', 'QC7-6396', 'active'
UNION ALL
SELECT 'XLBV', '6396 VIA', 'QC7-6396', 'active'
UNION ALL
SELECT 'XLBV', '9665', 'QC7-9665', 'active'
UNION ALL
SELECT 'XLBV', 'J498', 'FE3-J498', 'active'
UNION ALL
SELECT 'XLBV', 'J498 VIA', 'FE3-J498', 'active'
UNION ALL
SELECT 'XLBV', 'L918', 'FE3-L918', 'active'
UNION ALL
SELECT 'XLBV', 'L919', 'FE3-L919', 'active'
UNION ALL
SELECT 'XLBV', 'E393', 'FE3-E393', 'active'
UNION ALL
SELECT 'XLBV', 'E393 VIA', 'FE3-E393', 'active'
UNION ALL
SELECT 'XLBV', 'E409', 'FE3-E409', 'active'
UNION ALL
SELECT 'XLBV', 'E409 VIA', 'FE3-E409', 'active'
UNION ALL
SELECT 'XLBV', 'E503', 'FE3-E503', 'active'
UNION ALL
SELECT 'XLBV', 'E503 VIA', 'FE3-E503', 'active'
UNION ALL
SELECT 'XLBV', '2252', 'T0372252', 'active'
UNION ALL
SELECT 'XLBV', '3035', 'T0373035', 'active'
UNION ALL
SELECT 'XLBV', '3031 DẬP MÁY', 'T0373031', 'active'
UNION ALL
SELECT 'XLBV', '3031 KHOAN', 'T0373031', 'active'
UNION ALL
SELECT 'XLBV', '2125 L2', 'T0372125', 'active'
UNION ALL
SELECT 'XLBV', '2165 L2', 'T0372165', 'active'
UNION ALL
SELECT 'XLBV', '2209 L2', 'T0372209', 'active'
UNION ALL
SELECT 'XLBV', 'LWL9', 'LWL9BCS', 'active'
UNION ALL
SELECT 'XLBV', 'LWL12', 'LWL12BCS', 'active'
UNION ALL
SELECT 'XLBV', 'S1 NGOÀI', '108 (S1)', 'active'
UNION ALL
SELECT 'XLBV', 'S6 NGOÀI', '007 (S6)', 'active'
UNION ALL
SELECT 'XLBV', 'S7 NGOÀI', 'Gasket lens (S7)', 'active'
UNION ALL
SELECT 'XLBV', '234', '234 (S14)', 'active'
UNION ALL
SELECT 'XLBV', 'S19', '256 (S19)', 'active'
UNION ALL
SELECT 'XLBV', '174', '174 (S24)', 'active'
UNION ALL
SELECT 'XLBV', '174 NGOÀI', '174 (S24)', 'active'
UNION ALL
SELECT 'XLBV', '175', '175 (S23)', 'active'
UNION ALL
SELECT 'XLBV', '175 NGOÀI', '175 (S23)', 'active'
UNION ALL
SELECT 'XLBV', '245', '245 (S20)', 'active'
UNION ALL
SELECT 'XLBV', '247', '247 (S22)', 'active'
UNION ALL
SELECT 'XLBV', 'S18', '107 (S18)', 'active'
UNION ALL
SELECT 'XLBV', 'S17', '108 (S17)', 'active'
UNION ALL
SELECT 'XLBV', '161', '161 (S11)', 'active'
UNION ALL
SELECT 'XLBV', 'S9', '228 (S9)', 'active'
UNION ALL
SELECT 'XLBV', 'SU530', '120950A (SU-530)', 'active'
UNION ALL
SELECT 'XLBV', 'SU520', '120818B (SU-520)', 'active'
UNION ALL
SELECT 'XLBV', 'SU8000', '121931 (SU-8000)', 'active'
UNION ALL
SELECT 'XLBV', 'SILENCER', '121922 (Silencer)', 'active'
UNION ALL
SELECT 'XLBV', 'BUTTON', '121921 (Button)', 'active'
UNION ALL
SELECT 'XLBV', 'CASE SEALING', '121655A (Case sealing)', 'active'
UNION ALL
SELECT 'XLBV', 'KEY', '121654 (Key rubber)', 'active'
UNION ALL
SELECT 'XLBV', 'TOP HOLDER', '121937 (Holder)', 'active'
UNION ALL
SELECT 'XLBV', '3749', '24A-3749 (Rubber feet)', 'active'
UNION ALL
SELECT 'XLBV', 'MR05', 'C-NFA0063MR05', 'active'
UNION ALL
SELECT 'XLBV', 'MR237', 'C-NDB0068MR237', 'active'
UNION ALL
SELECT 'XLBV', '3002', 'T0373002', 'active'
UNION ALL
SELECT 'XLBV', '6035', 'V3-006035 (Oring)', 'active'
UNION ALL
SELECT 'XLBV', '6036', 'V3-006036 (Base 5)', 'active'
UNION ALL
SELECT 'XLBV', '6037', 'V3-006037 (Base 4)', 'active'
UNION ALL
SELECT 'XLBV', '5243', 'LF5243', 'active'
UNION ALL
SELECT 'XLBV', '9436 NGOÀI', 'LY9436', 'active'
UNION ALL
SELECT 'XLBV', '7236 NGOÀI', 'LS7236', 'active'
UNION ALL
SELECT 'XLBV', '6E', 'D0006E', 'active'
UNION ALL
SELECT 'XLBV', 'UY', 'D008UY', 'active'
UNION ALL
SELECT 'XLBV', 'UY NGOÀI', 'D008UY', 'active'
UNION ALL
SELECT 'XLBV', '2SV NGOÀI', 'D002SV', 'active'
UNION ALL
SELECT 'XLBV', '2SV', 'D002SV', 'active'
UNION ALL
SELECT 'XLBV', '1404', 'LP1404', 'active'
UNION ALL
SELECT 'XLBV', '4408', 'LS4408', 'active'
UNION ALL
SELECT 'XLBV', '9295', 'LX9295', 'active'
UNION ALL
SELECT 'XLBV', '40001', 'P45840001', 'active'
UNION ALL
SELECT 'XLBV', '5004', 'P10255004', 'active'
UNION ALL
SELECT 'XLBV', '9906', 'P57049906', 'active'
UNION ALL
SELECT 'XLBV', '6900', 'P58966900', 'active'
UNION ALL
SELECT 'XLBV', '2402', 'P57692402', 'active'
UNION ALL
SELECT 'XLBV', '6004', 'P49746004', 'active'
UNION ALL
SELECT 'XLBV', '9024', 'P32679024', 'active'
UNION ALL
SELECT 'XLBV', '9902', 'P66869902', 'active'
UNION ALL
SELECT 'XLBV', '603', 'P62830603', 'active'
UNION ALL
SELECT 'XLBV', '4305', 'P56364305', 'active'
UNION ALL
SELECT 'XLBV', '6485 NGOÀI', 'QC7-6485', 'active'
UNION ALL
SELECT 'XLBV', '6485', 'QC7-6485', 'active'
UNION ALL
SELECT 'XLBV', '6486 NGOÀI', 'QC7-6486', 'active'
UNION ALL
SELECT 'XLBV', '6486', 'QC7-6486', 'active'
UNION ALL
SELECT 'XLBV', '6486 VN', 'QC7-6486', 'active'
UNION ALL
SELECT 'XLBV', '6487', 'QC7-6487', 'active'
UNION ALL
SELECT 'XLBV', '6487 NGOÀI', 'QC7-6487', 'active'
UNION ALL
SELECT 'XLBV', '6488', 'QC7-6488', 'active'
UNION ALL
SELECT 'XLBV', '6488 NGOÀI', 'QC7-6488', 'active'
UNION ALL
SELECT 'XLBV', '6488 VN', 'QC7-6488', 'active'
UNION ALL
SELECT 'XLBV', '6489', 'QC7-6489', 'active'
UNION ALL
SELECT 'XLBV', '6489 NGOÀI', 'QC7-6489', 'active'
UNION ALL
SELECT 'XLBV', '6490', 'QC7-6490', 'active'
UNION ALL
SELECT 'XLBV', '6490 NGOÀI', 'QC7-6490', 'active'
UNION ALL
SELECT 'XLBV', '6490 VN', 'QC7-6490', 'active'
UNION ALL
SELECT 'XLBV', '6491', 'QC7-6491', 'active'
UNION ALL
SELECT 'XLBV', '6491 NGOÀI', 'QC7-6491', 'active'
UNION ALL
SELECT 'XLBV', '6492', 'QC7-6492', 'active'
UNION ALL
SELECT 'XLBV', '6492 NGOÀI', 'QC7-6492', 'active'
UNION ALL
SELECT 'XLBV', '6493', 'QC7-6493', 'active'
UNION ALL
SELECT 'XLBV', '6493 NGOÀI', 'QC7-6493', 'active'
UNION ALL
SELECT 'XLBV', '6494', 'QC7-6494', 'active'
UNION ALL
SELECT 'XLBV', '6494 NGOÀI', 'QC7-6494', 'active'
UNION ALL
SELECT 'XLBV', '6494 VN', 'QC7-6494', 'active'
UNION ALL
SELECT 'XLBV', '6495', 'QC7-6495', 'active'
UNION ALL
SELECT 'XLBV', '6495 NGOÀI', 'QC7-6495', 'active'
UNION ALL
SELECT 'XLBV', '6495 VN', 'QC7-6495', 'active'
UNION ALL
SELECT 'XLBV', '5091', 'FL4 5091', 'active'
UNION ALL
SELECT 'XLBV', '5092', 'FL4 5092', 'active'
UNION ALL
SELECT 'XLBV', '2421', '625542421', 'active'
UNION ALL
SELECT 'XLBV', '2431', '625542431', 'active'
UNION ALL
SELECT 'XLBV', '3311', '625543311', 'active'
UNION ALL
SELECT 'XLBV', '5120', '30375120', 'active'
UNION ALL
SELECT 'XLBV', '174-B1', '174 (S24)', 'active'
UNION ALL
SELECT 'XLBV', 'GRIP 50', 'Grip50', 'active'
UNION ALL
SELECT 'XLBV', 'TBN-47', 'TBN-47', 'active'
UNION ALL
SELECT 'XLBV', '0696 VIA', 'QC7-0696', 'active'
UNION ALL
SELECT 'XLBV', '5140', '30375140', 'active'
UNION ALL
SELECT 'XLBV', '6492 VN', 'QC7-6492', 'active'
UNION ALL
SELECT 'XLBV', '9436', 'LY9436', 'active'
UNION ALL
SELECT 'XLBV', 'S1', '108 (S1)', 'active'
UNION ALL
SELECT 'XLBV', 'n23', 'D02N23', 'active'
UNION ALL
SELECT 'XLBV', 'Y225', 'FE2-Y225', 'active'
UNION ALL
SELECT 'XLBV', '9500', '74679500', 'active'
UNION ALL
SELECT 'XLBV', '80000', '74680000', 'active'
UNION ALL
SELECT 'XLBV', '9300', '74679300', 'active'
UNION ALL
SELECT 'XLBV', '7236#3', 'LS7236', 'active'
UNION ALL
SELECT 'XLBV', '2606 L2', 'D4-262606', 'active'
UNION ALL
SELECT 'XLBV', 'D02DFV', 'D02DFV', 'active'
UNION ALL
SELECT 'XLBV', 'GRIP SI', 'Grip SI', 'active'
UNION ALL
SELECT 'XLBV', '5150', '30375150', 'active'
UNION ALL
SELECT 'XLBV', '3901', 'P74593901', 'active'
UNION ALL
SELECT 'XLBV', '4001', 'P74594001', 'active'
UNION ALL
SELECT 'EP', '5243', 'LF5243', 'active'
UNION ALL
SELECT 'EP', 'UM-2', 'D008UM', 'active'
UNION ALL
SELECT 'EP', '125', 'LEH125', 'active'
UNION ALL
SELECT 'EP', '9436-3', 'LY9436', 'active'
UNION ALL
SELECT 'EP', '9436-4', 'LY9436', 'active'
UNION ALL
SELECT 'EP', '7236', 'LS7236', 'active'
UNION ALL
SELECT 'EP', '7236-3', 'LS7236', 'active'
UNION ALL
SELECT 'EP', '8016', 'LY8016', 'active'
UNION ALL
SELECT 'EP', '129-3', 'LEM129', 'active'
UNION ALL
SELECT 'EP', '9118-3', 'LY9118', 'active'
UNION ALL
SELECT 'EP', '9142-3', 'LY9142', 'active'
UNION ALL
SELECT 'EP', 'D006P-2', 'D0006E', 'active'
UNION ALL
SELECT 'EP', '15U-2', 'LX9295', 'active'
UNION ALL
SELECT 'EP', '15U-3', 'LX9295', 'active'
UNION ALL
SELECT 'EP', 'UY-2', 'D008UY', 'active'
UNION ALL
SELECT 'EP', '2SV-2', 'D002SV', 'active'
UNION ALL
SELECT 'EP', 'KCN', 'D01KCN', 'active'
UNION ALL
SELECT 'EP', 'YYU', 'D01YYU', 'active'
UNION ALL
SELECT 'EP', 'YYU-2', 'D01YYU', 'active'
UNION ALL
SELECT 'EP', 'YYU-3', 'D01YYU', 'active'
UNION ALL
SELECT 'EP', '1404', 'LP1404', 'active'
UNION ALL
SELECT 'EP', '4408', 'LS4408', 'active'
UNION ALL
SELECT 'EP', '9295', 'LX9295', 'active'
UNION ALL
SELECT 'EP', '27UA', 'D027UA', 'active'
UNION ALL
SELECT 'EP', 'GYX', 'GYX', 'active'
UNION ALL
SELECT 'EP', '1432', 'LP1432', 'active'
UNION ALL
SELECT 'EP', '8500', '194838500', 'active'
UNION ALL
SELECT 'EP', '40001', 'P45840001', 'active'
UNION ALL
SELECT 'EP', '9906', 'P57049906', 'active'
UNION ALL
SELECT 'EP', '6900', 'P58966900', 'active'
UNION ALL
SELECT 'EP', '2402', 'P57692402', 'active'
UNION ALL
SELECT 'EP', '6004', 'P49746004', 'active'
UNION ALL
SELECT 'EP', '9023', 'P32679023', 'active'
UNION ALL
SELECT 'EP', '9902', 'P66869902', 'active'
UNION ALL
SELECT 'EP', '603', 'P62830603', 'active'
UNION ALL
SELECT 'EP', '4305', 'P56364305', 'active'
UNION ALL
SELECT 'EP', '8484', 'QC4-8484', 'active'
UNION ALL
SELECT 'EP', '6044', 'R2556', 'active'
UNION ALL
SELECT 'EP', '6270', 'R2556', 'active'
UNION ALL
SELECT 'EP', '3880', 'R3880', 'active'
UNION ALL
SELECT 'EP', '1080-2', 'QC5-1080', 'active'
UNION ALL
SELECT 'EP', '1090', 'QC5-1090', 'active'
UNION ALL
SELECT 'EP', '8234', 'QC6-8234', 'active'
UNION ALL
SELECT 'EP', '8235', 'QC6-8235', 'active'
UNION ALL
SELECT 'EP', '0696-1', 'QC7-0696', 'active'
UNION ALL
SELECT 'EP', '0696-2', 'QC7-0696', 'active'
UNION ALL
SELECT 'EP', '0696-3', 'QC7-0696', 'active'
UNION ALL
SELECT 'EP', '6396', 'QC7-6396', 'active'
UNION ALL
SELECT 'EP', '9665', 'QC7-9665', 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE product_code=VALUES(product_code), status='active' ;

INSERT INTO product_aliases (process_id, alias_code, product_code, status)
SELECT p.id, s.alias_code, s.product_code, 'active'
FROM (
SELECT 'EP' AS `process_code`, '7630' AS `alias_code`, 'QC4-7630' AS `product_code`, 'active' AS `status`
UNION ALL
SELECT 'EP', '1657', 'QC5-1657', 'active'
UNION ALL
SELECT 'EP', '6773', 'QC6-6773', 'active'
UNION ALL
SELECT 'EP', '5091', 'FL4 5091', 'active'
UNION ALL
SELECT 'EP', '5092', 'FL4 5092', 'active'
UNION ALL
SELECT 'EP', '8052', 'QC7-8052', 'active'
UNION ALL
SELECT 'EP', 'j498', 'FE3-J498', 'active'
UNION ALL
SELECT 'EP', 'L918', 'FE3-L918', 'active'
UNION ALL
SELECT 'EP', 'L919', 'FE3-L919', 'active'
UNION ALL
SELECT 'EP', 'E393', 'FE3-E393', 'active'
UNION ALL
SELECT 'EP', 'E409', 'FE3-E409', 'active'
UNION ALL
SELECT 'EP', 'E503', 'FE3-E503', 'active'
UNION ALL
SELECT 'EP', '2252', 'T0372252', 'active'
UNION ALL
SELECT 'EP', '3035-1', 'T0373035', 'active'
UNION ALL
SELECT 'EP', '3035-2', 'T0373035', 'active'
UNION ALL
SELECT 'EP', '3031', 'T0373031', 'active'
UNION ALL
SELECT 'EP', '0575', 'MA3-0575', 'active'
UNION ALL
SELECT 'EP', '2125', 'T0372125', 'active'
UNION ALL
SELECT 'EP', '2165', 'T0372165', 'active'
UNION ALL
SELECT 'EP', '2209', 'T0372209', 'active'
UNION ALL
SELECT 'EP', 'LWL9-2', 'LWL9BCS', 'active'
UNION ALL
SELECT 'EP', 'LWL12', 'LWL12BCS', 'active'
UNION ALL
SELECT 'EP', 'S1', '108 (S1)', 'active'
UNION ALL
SELECT 'EP', 'S6', '007 (S6)', 'active'
UNION ALL
SELECT 'EP', 'S7', 'Gasket lens (S7)', 'active'
UNION ALL
SELECT 'EP', '234', '234 (S14)', 'active'
UNION ALL
SELECT 'EP', 'S19', '256 (S19)', 'active'
UNION ALL
SELECT 'EP', 'SOCKET-D', '174 (S24)', 'active'
UNION ALL
SELECT 'EP', 'SOCKET-H', '174 (S24)', 'active'
UNION ALL
SELECT 'EP', 'SOCKET-E', '174 (S24)', 'active'
UNION ALL
SELECT 'EP', 'SOCKET-C', '174 (S24)', 'active'
UNION ALL
SELECT 'EP', 'SOCKET-G', '174 (S24)', 'active'
UNION ALL
SELECT 'EP', 'SOCKET175-C', '175 (S23)', 'active'
UNION ALL
SELECT 'EP', 'SOCKET175-D', '175 (S23)', 'active'
UNION ALL
SELECT 'EP', '245', '245 (S20)', 'active'
UNION ALL
SELECT 'EP', '247-2', '247 (S22)', 'active'
UNION ALL
SELECT 'EP', 'S18', '107 (S18)', 'active'
UNION ALL
SELECT 'EP', 'S17', '108 (S17)', 'active'
UNION ALL
SELECT 'EP', '161', '161 (S11)', 'active'
UNION ALL
SELECT 'EP', 'S9', '228 (S9)', 'active'
UNION ALL
SELECT 'EP', 'SU530', '120950A (SU-530)', 'active'
UNION ALL
SELECT 'EP', 'SU520', '120818B (SU-520)', 'active'
UNION ALL
SELECT 'EP', 'SU8000', '121931 (SU-8000)', 'active'
UNION ALL
SELECT 'EP', 'KEY RUBBE', '121654 (Key rubber)', 'active'
UNION ALL
SELECT 'EP', 'TOPHOLDER', '121937 (Holder)', 'active'
UNION ALL
SELECT 'EP', '3749', '24A-3749 (Rubber feet)', 'active'
UNION ALL
SELECT 'EP', 'MR05', 'C-NFA0063MR05', 'active'
UNION ALL
SELECT 'EP', 'MR237', 'C-NDB0068MR237', 'active'
UNION ALL
SELECT 'EP', '3002', 'T0373002', 'active'
UNION ALL
SELECT 'EP', '2401', '625542421', 'active'
UNION ALL
SELECT 'EP', '2411', '625542431', 'active'
UNION ALL
SELECT 'EP', '3301', '625543311', 'active'
UNION ALL
SELECT 'EP', '6035', 'V3-006035 (Oring)', 'active'
UNION ALL
SELECT 'EP', '6036', 'V3-006036 (Base 5)', 'active'
UNION ALL
SELECT 'EP', '6037', 'V3-006037 (Base 4)', 'active'
UNION ALL
SELECT 'EP', '6485', 'QC7-6485', 'active'
UNION ALL
SELECT 'EP', '6486', 'QC7-6486', 'active'
UNION ALL
SELECT 'EP', '6487', 'QC7-6487', 'active'
UNION ALL
SELECT 'EP', '6488', 'QC7-6488', 'active'
UNION ALL
SELECT 'EP', '6489', 'QC7-6489', 'active'
UNION ALL
SELECT 'EP', '6490-1', 'QC7-6490', 'active'
UNION ALL
SELECT 'EP', '6490-2', 'QC7-6490', 'active'
UNION ALL
SELECT 'EP', '6491', 'QC7-6491', 'active'
UNION ALL
SELECT 'EP', '6492', 'QC7-6492', 'active'
UNION ALL
SELECT 'EP', '6493', 'QC7-6493', 'active'
UNION ALL
SELECT 'EP', '6494', 'QC7-6494', 'active'
UNION ALL
SELECT 'EP', '6495', 'QC7-6495', 'active'
UNION ALL
SELECT 'EP', 'GRIP50', 'Grip50', 'active'
UNION ALL
SELECT 'EP', 'GRIP65', 'Grip65', 'active'
UNION ALL
SELECT 'EP', '5120', '30375120', 'active'
UNION ALL
SELECT 'EP', '1467', 'QC9-1467', 'active'
UNION ALL
SELECT 'EP', 'N23', 'D02N23', 'active'
UNION ALL
SELECT 'GC', 'c2556-2', 'R2556', 'active'
UNION ALL
SELECT 'GC', 'c2556-11', 'R2556', 'active'
UNION ALL
SELECT 'GC', 'c2556-8', 'R2556', 'active'
UNION ALL
SELECT 'GC', 'c2556-9', 'R2556', 'active'
UNION ALL
SELECT 'GC', '2556-auto', 'R2556', 'active'
UNION ALL
SELECT 'GC', 'C2556-auto', 'R2556', 'active'
UNION ALL
SELECT 'GC', 'c8484', 'R8484', 'active'
UNION ALL
SELECT 'GC', 'c8485', 'R8234', 'active'
UNION ALL
SELECT 'GC', 'c3880-2', 'R3880', 'active'
UNION ALL
SELECT 'GC', 'c3880-11', 'R3880', 'active'
UNION ALL
SELECT 'GC', 'c3880-8', 'R3880', 'active'
UNION ALL
SELECT 'GC', 'c3880-9', 'R3880', 'active'
UNION ALL
SELECT 'GC', 'c9149', 'R3880-8', 'active'
UNION ALL
SELECT 'GC', 'c0575', 'R0575', 'active'
UNION ALL
SELECT 'GC', 'c3438', 'R3438', 'active'
UNION ALL
SELECT 'GC', 'c1080', 'R1080', 'active'
UNION ALL
SELECT 'GC', 'c1090', 'R1090', 'active'
UNION ALL
SELECT 'GC', 'c1657', 'R1657', 'active'
UNION ALL
SELECT 'GC', 'c5770-9', 'R2556-8', 'active'
UNION ALL
SELECT 'GC', 'c7630', 'R7630', 'active'
UNION ALL
SELECT 'GC', 'c5770', 'R2556-8', 'active'
UNION ALL
SELECT 'GC', 'c8052', 'R8052', 'active'
UNION ALL
SELECT 'GC', 'C5770-1', 'R2556-8', 'active'
UNION ALL
SELECT 'GC', 'c8234', 'R8234', 'active'
UNION ALL
SELECT 'GC', 'c8235', 'R8235', 'active'
UNION ALL
SELECT 'GC', 'c6773', 'R6773', 'active'
UNION ALL
SELECT 'GC', 'cpk-r', 'R08UM', 'active'
UNION ALL
SELECT 'GC', 'c125', 'R125', 'active'
UNION ALL
SELECT 'GC', 'c7236', 'R7236', 'active'
UNION ALL
SELECT 'GC', 'c2453', 'R2453', 'active'
UNION ALL
SELECT 'GC', 'c79c', 'R79C', 'active'
UNION ALL
SELECT 'GC', 'c79c-3', 'R79C', 'active'
UNION ALL
SELECT 'GC', 'cdk1', 'RDK1', 'active'
UNION ALL
SELECT 'GC', 'c4268', 'R4268', 'active'
UNION ALL
SELECT 'GC', 'c8016', 'R8016', 'active'
UNION ALL
SELECT 'GC', 'c129', 'R129', 'active'
UNION ALL
SELECT 'GC', 'c9118', 'R9118', 'active'
UNION ALL
SELECT 'GC', 'c9142', 'R9142', 'active'
UNION ALL
SELECT 'GC', 'c7236-2', 'R7236', 'active'
UNION ALL
SELECT 'GC', 'c1432', 'LP1432', 'active'
UNION ALL
SELECT 'GC', 'c4268-3', 'R4268', 'active'
UNION ALL
SELECT 'GC', 'C129-13', 'R129', 'active'
UNION ALL
SELECT 'GC', 'c8um', 'R08UM', 'active'
UNION ALL
SELECT 'GC', 'c9118-13', 'R9118', 'active'
UNION ALL
SELECT 'GC', 'c8um-3', 'R08UM', 'active'
UNION ALL
SELECT 'GC', 'ckcn', 'R2453', 'active'
UNION ALL
SELECT 'GC', 'c3880-auto', 'R3880', 'active'
UNION ALL
SELECT 'GC', 'c5770-auto', 'R2556-8', 'active'
UNION ALL
SELECT 'GC', 'C8016-12', 'R8016', 'active'
UNION ALL
SELECT 'GC', 'c8um-t', 'R08UM', 'active'
UNION ALL
SELECT 'GC', 'c8uy', 'R08UY', 'active'
UNION ALL
SELECT 'GC', 'C502', 'R502', 'active'
UNION ALL
SELECT 'GC', 'c9149-1', 'R3880-8', 'active'
UNION ALL
SELECT 'GC', 'C9149-AUTO', 'R3880-8', 'active'
UNION ALL
SELECT 'GC', 'C6485', 'QC7-6485', 'active'
UNION ALL
SELECT 'GC', 'c6486', 'QC7-6486', 'active'
UNION ALL
SELECT 'GC', 'c6487', 'QC7-6487', 'active'
UNION ALL
SELECT 'GC', 'c6488', 'QC7-6488', 'active'
UNION ALL
SELECT 'GC', 'c6489', 'QC7-6489', 'active'
UNION ALL
SELECT 'GC', 'c6490', 'QC7-6490', 'active'
UNION ALL
SELECT 'GC', 'c6491', 'QC7-6491', 'active'
UNION ALL
SELECT 'GC', 'c6492', 'QC7-6492', 'active'
UNION ALL
SELECT 'GC', 'c6493', 'QC7-6493', 'active'
UNION ALL
SELECT 'GC', 'c6494', 'QC7-6494', 'active'
UNION ALL
SELECT 'GC', 'c6495', 'QC7-6495', 'active'
UNION ALL
SELECT 'GC', 'cd027u8', 'RD027U8', 'active'
UNION ALL
SELECT 'GC', 'CGYX-9', 'GYX', 'active'
UNION ALL
SELECT 'GC', 'CGYX', 'GYX', 'active'
UNION ALL
SELECT 'GC', 'CGYX-AUTO', 'GYX', 'active'
UNION ALL
SELECT 'GC', 'cgyx-1', 'GYX', 'active'
UNION ALL
SELECT 'GC', 'C8052-1', 'R8052', 'active'
UNION ALL
SELECT 'GC', 'c1404', 'LP1404', 'active'
UNION ALL
SELECT 'GC', 'C6328', 'QC8-6328', 'active'
UNION ALL
SELECT 'GC', 'c6330', 'QC8-6330', 'active'
UNION ALL
SELECT 'GC', 'c9520', 'QC8-9520', 'active'
UNION ALL
SELECT 'GC', 'CD02N23', 'D02N23', 'active'
UNION ALL
SELECT 'GC', 'CD02N3', 'D02N3', 'active'
UNION ALL
SELECT 'GC', 'CD02N3C', 'D02N3C', 'active'
UNION ALL
SELECT 'GC', '9477', 'QC7-9477', 'active'
UNION ALL
SELECT 'GC', '5243-l', 'LF5243-L', 'active'
UNION ALL
SELECT 'GC', '15U', 'D0015U', 'active'
UNION ALL
SELECT 'GC', '9740', 'QC5-9740', 'active'
UNION ALL
SELECT 'GC', '2801', 'QC3-2801', 'active'
UNION ALL
SELECT 'GC', '2801-2', 'QC3-2801', 'active'
UNION ALL
SELECT 'GC', '6262', 'QC4-6262', 'active'
UNION ALL
SELECT 'GC', '7133', 'QC4-7133', 'active'
UNION ALL
SELECT 'GC', '598', 'QC7-0598', 'active'
UNION ALL
SELECT 'GC', '8484', 'QC4-8484', 'active'
UNION ALL
SELECT 'GC', '8485', 'QC4-8485', 'active'
UNION ALL
SELECT 'GC', '4563', 'QC6-4563', 'active'
UNION ALL
SELECT 'GC', '3880', 'QC5-3880', 'active'
UNION ALL
SELECT 'GC', '7960', 'QC4-7960', 'active'
UNION ALL
SELECT 'GC', '9149', 'QC2-9149', 'active'
UNION ALL
SELECT 'GC', '575', 'MA3-0575', 'active'
UNION ALL
SELECT 'GC', '3438', 'QC5-3438', 'active'
UNION ALL
SELECT 'GC', '1080', 'QC5-1080', 'active'
UNION ALL
SELECT 'GC', '1090', 'QC5-1090', 'active'
UNION ALL
SELECT 'GC', '1657-16', 'QC5-1657', 'active'
UNION ALL
SELECT 'GC', '1657', 'QC5-1657', 'active'
UNION ALL
SELECT 'GC', '1660-16', 'QC5-1660', 'active'
UNION ALL
SELECT 'GC', '1660', 'QC5-1660', 'active'
UNION ALL
SELECT 'GC', '7630', 'QC4-7630', 'active'
UNION ALL
SELECT 'GC', '5770', 'QC5-5770', 'active'
UNION ALL
SELECT 'GC', '5861', 'QC5-5861', 'active'
UNION ALL
SELECT 'GC', '9565', 'QC5-9565', 'active'
UNION ALL
SELECT 'GC', '8234', 'QC6-8234', 'active'
UNION ALL
SELECT 'GC', '8235', 'QC6-8235', 'active'
UNION ALL
SELECT 'GC', '6773', 'QC6-6773', 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE product_code=VALUES(product_code), status='active' ;

INSERT INTO product_aliases (process_id, alias_code, product_code, status)
SELECT p.id, s.alias_code, s.product_code, 'active'
FROM (
SELECT 'GC' AS `process_code`, '5243' AS `alias_code`, 'LF5243' AS `product_code`, 'active' AS `status`
UNION ALL
SELECT 'GC', '123', 'LEH123', 'active'
UNION ALL
SELECT 'GC', '125', 'LEH125', 'active'
UNION ALL
SELECT 'GC', '7236', 'LS7236', 'active'
UNION ALL
SELECT 'GC', '2168', 'LY2168', 'active'
UNION ALL
SELECT 'GC', '2173', 'LY2173', 'active'
UNION ALL
SELECT 'GC', '79c', 'D0079C', 'active'
UNION ALL
SELECT 'GC', 'dk1', 'D00DK1', 'active'
UNION ALL
SELECT 'GC', '4258', 'LY4258', 'active'
UNION ALL
SELECT 'GC', '8014', 'LY8014', 'active'
UNION ALL
SELECT 'GC', '127', 'LEM127', 'active'
UNION ALL
SELECT 'GC', '9116', 'LY9116', 'active'
UNION ALL
SELECT 'GC', '9140', 'LY9140', 'active'
UNION ALL
SELECT 'GC', '9276', 'LY9276', 'active'
UNION ALL
SELECT 'GC', 'd0049', 'D00049', 'active'
UNION ALL
SELECT 'GC', '8w6', 'D008W6', 'active'
UNION ALL
SELECT 'GC', 'gfm', 'D00GFM', 'active'
UNION ALL
SELECT 'GC', 'D027U8', 'D027U8', 'active'
UNION ALL
SELECT 'GC', '9295', 'LX9295', 'active'
UNION ALL
SELECT 'GC', 'd49', 'D00049', 'active'
UNION ALL
SELECT 'GC', '8011', 'RP27678011', 'active'
UNION ALL
SELECT 'GC', '1432-kt', '1432-kt', 'active'
UNION ALL
SELECT 'GC', '15u-t', 'D0015U-T', 'active'
UNION ALL
SELECT 'GC', '8052', 'QC7-8052', 'active'
UNION ALL
SELECT 'GC', '6001', 'P28596001', 'active'
UNION ALL
SELECT 'GC', '2ss', 'D002SS', 'active'
UNION ALL
SELECT 'GC', '9140-3', 'LY9140', 'active'
UNION ALL
SELECT 'GC', '6e', 'D0006E', 'active'
UNION ALL
SELECT 'GC', '16h', 'D0016H', 'active'
UNION ALL
SELECT 'GC', '8uy', 'D008UY', 'active'
UNION ALL
SELECT 'GC', 'pk', 'D000PK', 'active'
UNION ALL
SELECT 'GC', '16d', 'D0016D', 'active'
UNION ALL
SELECT 'GC', '16m', 'D0016M', 'active'
UNION ALL
SELECT 'GC', '8um', 'D008UM', 'active'
UNION ALL
SELECT 'GC', '4408', 'LS4408', 'active'
UNION ALL
SELECT 'GC', '6e-c1', 'D0006E', 'active'
UNION ALL
SELECT 'GC', '6e-c2', 'D0006E', 'active'
UNION ALL
SELECT 'GC', '6e/2', 'D0006E', 'active'
UNION ALL
SELECT 'GC', '127-t', 'LEM127', 'active'
UNION ALL
SELECT 'GC', '8um-1', 'D008UM', 'active'
UNION ALL
SELECT 'GC', '16m-1', 'D0016M', 'active'
UNION ALL
SELECT 'GC', '8w6-1', 'D008W6', 'active'
UNION ALL
SELECT 'GC', '9140-1', 'LY9140', 'active'
UNION ALL
SELECT 'GC', 'gfm-3', 'D00GFM', 'active'
UNION ALL
SELECT 'GC', 'kct', 'D01KCT', 'active'
UNION ALL
SELECT 'GC', 'kcn', 'D01KCN', 'active'
UNION ALL
SELECT 'GC', '9477-z', 'QC7-9477', 'active'
UNION ALL
SELECT 'GC', '9477', 'QC7-9477', 'active'
UNION ALL
SELECT 'GC', '6270', 'QC7-6270', 'active'
UNION ALL
SELECT 'GC', '5770-Z', 'QC5-5770', 'active'
UNION ALL
SELECT 'GC', '6270-Z', 'QC7-6270', 'active'
UNION ALL
SELECT 'GC', '5091', 'FL4-5091', 'active'
UNION ALL
SELECT 'GC', '9140-1', 'LY9140', 'active'
UNION ALL
SELECT 'GC', 'gfm-3', 'D00GFM', 'active'
UNION ALL
SELECT 'GC', '5092', 'FL4-5092', 'active'
UNION ALL
SELECT 'GC', '1404', 'LP1404', 'active'
UNION ALL
SELECT 'GC', '6485-l', 'QC7-6485', 'active'
UNION ALL
SELECT 'GC', '6487-l', 'QC7-6487', 'active'
UNION ALL
SELECT 'GC', '6488-l', 'QC7-6488', 'active'
UNION ALL
SELECT 'GC', '6489-l', 'QC7-6489', 'active'
UNION ALL
SELECT 'GC', '6490-l', 'QC7-6490', 'active'
UNION ALL
SELECT 'GC', '6491', 'QC7-6491', 'active'
UNION ALL
SELECT 'GC', '6492-l', 'QC7-6492', 'active'
UNION ALL
SELECT 'GC', '6492-m', 'QC7-6492', 'active'
UNION ALL
SELECT 'GC', '6494-l', 'QC7-6494', 'active'
UNION ALL
SELECT 'GC', '6495-l', 'QC7-6495', 'active'
UNION ALL
SELECT 'GC', '6486-l', 'QC7-6486', 'active'
UNION ALL
SELECT 'GC', '6486-m', 'QC7-6486', 'active'
UNION ALL
SELECT 'GC', '6494-m', 'QC7-6494', 'active'
UNION ALL
SELECT 'GC', '6495-m', 'QC7-6495', 'active'
UNION ALL
SELECT 'GC', '6493-m', 'QC7-6493', 'active'
UNION ALL
SELECT 'GC', '9968', 'QC8-9968', 'active'
UNION ALL
SELECT 'GC', '6240', 'QC8-6240', 'active'
UNION ALL
SELECT 'GC', '6242', 'QC8-6242', 'active'
UNION ALL
SELECT 'GC', '9520', 'QC8-9520', 'active'
UNION ALL
SELECT 'GC', '9503', 'QC8-9503', 'active'
UNION ALL
SELECT 'GC', '977', '6A3-0977', 'active'
UNION ALL
SELECT 'GC', '4408-T', 'LS4408 - T', 'active'
UNION ALL
SELECT 'GC', '6328', 'QC8-6328', 'active'
UNION ALL
SELECT 'GC', '6330', 'QC8-6330', 'active'
UNION ALL
SELECT 'GC', '6240', 'QC8-6240', 'active'
UNION ALL
SELECT 'GC', '6242', 'QC8-6242', 'active'
UNION ALL
SELECT 'GC', '9520', 'QC8-9520', 'active'
UNION ALL
SELECT 'GC', '9503', 'QC8-9503', 'active'
UNION ALL
SELECT 'GC', '9295-l', 'LX9295-L', 'active'
UNION ALL
SELECT 'GC', 'D02N23', 'D02N23', 'active'
UNION ALL
SELECT 'GC', 'D02N3', 'D02N3', 'active'
UNION ALL
SELECT 'MAI', '9740', 'QC5-9740', 'active'
UNION ALL
SELECT 'MAI', '2801', 'QC3-2801', 'active'
UNION ALL
SELECT 'MAI', '6262', 'QC4-6262', 'active'
UNION ALL
SELECT 'MAI', '7133', 'QC4-7133', 'active'
UNION ALL
SELECT 'MAI', '7133-t', 'QC4-7133', 'active'
UNION ALL
SELECT 'MAI', '9149', 'QC2-9149', 'active'
UNION ALL
SELECT 'MAI', '9149-1', 'QC2-9149', 'active'
UNION ALL
SELECT 'MAI', '598', 'QC7-0598', 'active'
UNION ALL
SELECT 'MAI', '9295', 'LX9295', 'active'
UNION ALL
SELECT 'MAI', '7630', 'QC4-7630', 'active'
UNION ALL
SELECT 'MAI', '4563', 'QC6-4563', 'active'
UNION ALL
SELECT 'MAI', '8484', 'QC4-8484', 'active'
UNION ALL
SELECT 'MAI', '8485', 'QC4-8485', 'active'
UNION ALL
SELECT 'MAI', '3880', 'QC5-3880', 'active'
UNION ALL
SELECT 'MAI', '1080', 'QC5-1080', 'active'
UNION ALL
SELECT 'MAI', '1080-14', 'QC5-1080', 'active'
UNION ALL
SELECT 'MAI', '1080-17', 'QC5-1080', 'active'
UNION ALL
SELECT 'MAI', '1080-G30', 'QC5-1080', 'active'
UNION ALL
SELECT 'MAI', '1080-R', 'QC5-1080', 'active'
UNION ALL
SELECT 'MAI', '1090', 'QC5-1090', 'active'
UNION ALL
SELECT 'MAI', '1090-14', 'QC5-1090', 'active'
UNION ALL
SELECT 'MAI', '1090-17', 'QC5-1090', 'active'
UNION ALL
SELECT 'MAI', '1090-22', 'QC5-1090', 'active'
UNION ALL
SELECT 'MAI', '1090-G30', 'QC5-1090', 'active'
UNION ALL
SELECT 'MAI', '1090-R', 'QC5-1090', 'active'
UNION ALL
SELECT 'MAI', '1090-12', 'QC5-1090', 'active'
UNION ALL
SELECT 'MAI', '5770', 'QC5-5770', 'active'
UNION ALL
SELECT 'MAI', 'mài lại 5770', 'QC5-5770', 'active'
UNION ALL
SELECT 'MAI', '5861', 'QC5-5861', 'active'
UNION ALL
SELECT 'MAI', '8234', 'QC6-8234', 'active'
UNION ALL
SELECT 'MAI', '8235', 'QC6-8235', 'active'
UNION ALL
SELECT 'MAI', '6270', 'QC7-6270', 'active'
UNION ALL
SELECT 'MAI', '5091', 'FL4-5091', 'active'
UNION ALL
SELECT 'MAI', '5092', 'FL4-5092', 'active'
UNION ALL
SELECT 'MAI', '9477', 'QC7-9477', 'active'
UNION ALL
SELECT 'MAI', '9565-1', 'QC5-9565', 'active'
UNION ALL
SELECT 'MAI', '9565-2', 'QC5-9565', 'active'
UNION ALL
SELECT 'MAI', '575', 'MA3-0575', 'active'
UNION ALL
SELECT 'MAI', '0575-2', 'MA3-0575', 'active'
UNION ALL
SELECT 'MAI', '6773-1', 'QC6-6773', 'active'
UNION ALL
SELECT 'MAI', '6773-2', 'QC6-6773', 'active'
UNION ALL
SELECT 'MAI', '1657-7.1', 'QC5-1657', 'active'
UNION ALL
SELECT 'MAI', '1657-2', 'QC5-1657', 'active'
UNION ALL
SELECT 'MAI', '1657-8.2', 'QC5-1657', 'active'
UNION ALL
SELECT 'MAI', '1657-7.3', 'QC5-1657', 'active'
UNION ALL
SELECT 'MAI', '1660-2', 'QC5-1660', 'active'
UNION ALL
SELECT 'MAI', '8052-3', 'QC7-8052', 'active'
UNION ALL
SELECT 'MAI', '8052-4', 'QC7-8052', 'active'
UNION ALL
SELECT 'MAI', '6486-1', 'QC7-6486', 'active'
UNION ALL
SELECT 'MAI', '6486-2', 'QC7-6486', 'active'
UNION ALL
SELECT 'MAI', '6486', 'QC7-6486', 'active'
UNION ALL
SELECT 'MAI', '6487', 'QC7-6487', 'active'
UNION ALL
SELECT 'MAI', '6487-1', 'QC7-6487', 'active'
UNION ALL
SELECT 'MAI', '6487-2', 'QC7-6487', 'active'
UNION ALL
SELECT 'MAI', '6488', 'QC7-6488', 'active'
UNION ALL
SELECT 'MAI', '6488-1', 'QC7-6488', 'active'
UNION ALL
SELECT 'MAI', '6488-2', 'QC7-6488', 'active'
UNION ALL
SELECT 'MAI', '6489-2', 'QC7-6489', 'active'
UNION ALL
SELECT 'MAI', '6489', 'QC7-6489', 'active'
UNION ALL
SELECT 'MAI', '6490', 'QC7-6490', 'active'
UNION ALL
SELECT 'MAI', '6490-1', 'QC7-6490', 'active'
UNION ALL
SELECT 'MAI', '6490-2', 'QC7-6490', 'active'
UNION ALL
SELECT 'MAI', '6491', 'QC7-6491', 'active'
UNION ALL
SELECT 'MAI', '6491-2', 'QC7-6491', 'active'
UNION ALL
SELECT 'MAI', '6492-1', 'QC7-6492', 'active'
UNION ALL
SELECT 'MAI', '6492-2', 'QC7-6492', 'active'
UNION ALL
SELECT 'MAI', '6493-1', 'QC7-6493', 'active'
UNION ALL
SELECT 'MAI', '6493-2', 'QC7-6493', 'active'
UNION ALL
SELECT 'MAI', '6493-r', 'QC7-6493', 'active'
UNION ALL
SELECT 'MAI', '6494-1', 'QC7-6494', 'active'
UNION ALL
SELECT 'MAI', '6494', 'QC7-6494', 'active'
UNION ALL
SELECT 'MAI', '6495', 'QC7-6495', 'active'
UNION ALL
SELECT 'MAI', '6495-23', 'QC7-6495', 'active'
UNION ALL
SELECT 'MAI', '6492', 'QC7-6492', 'active'
UNION ALL
SELECT 'MAI', '6494-2', 'QC7-6494', 'active'
UNION ALL
SELECT 'MAI', '6494-r', 'QC7-6494', 'active'
UNION ALL
SELECT 'MAI', '6495-1', 'QC7-6495', 'active'
UNION ALL
SELECT 'MAI', '6495-2', 'QC7-6495', 'active'
UNION ALL
SELECT 'MAI', '6495-r', 'QC7-6495', 'active'
UNION ALL
SELECT 'MAI', '9740-t', 'QC5-9740', 'active'
UNION ALL
SELECT 'MAI', '0598-T', 'QC7-0598', 'active'
UNION ALL
SELECT 'MAI', '123-1', 'LEH123', 'active'
UNION ALL
SELECT 'MAI', '123-2', 'LEH123', 'active'
UNION ALL
SELECT 'MAI', '125-1', 'LEH125', 'active'
UNION ALL
SELECT 'MAI', '9276-20', 'LY9276', 'active'
UNION ALL
SELECT 'MAI', '9276-15', 'LY9276', 'active'
UNION ALL
SELECT 'MAI', '9276-2', 'LY9276', 'active'
UNION ALL
SELECT 'MAI', '9276', 'LY9276', 'active'
UNION ALL
SELECT 'MAI', '5.9999999999999998E-30', 'D0006E', 'active'
UNION ALL
SELECT 'MAI', '6E/2', 'D0006E', 'active'
UNION ALL
SELECT 'MAI', '6E', 'D0006E', 'active'
UNION ALL
SELECT 'MAI', 'PK-1', 'D000PK', 'active'
UNION ALL
SELECT 'MAI', 'PK-2', 'D000PK', 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE product_code=VALUES(product_code), status='active' ;

INSERT INTO product_aliases (process_id, alias_code, product_code, status)
SELECT p.id, s.alias_code, s.product_code, 'active'
FROM (
SELECT 'MAI' AS `process_code`, 'D00PK' AS `alias_code`, 'D000PK' AS `product_code`, 'active' AS `status`
UNION ALL
SELECT 'MAI', '16D-1', 'D0016D', 'active'
UNION ALL
SELECT 'MAI', '16D', 'D0016D', 'active'
UNION ALL
SELECT 'MAI', '16D-2', 'D0016D', 'active'
UNION ALL
SELECT 'MAI', '16D-20', 'D0016D', 'active'
UNION ALL
SELECT 'MAI', '16H-2', 'D0016H', 'active'
UNION ALL
SELECT 'MAI', '16h', 'D0016H', 'active'
UNION ALL
SELECT 'MAI', '9276-7', 'LY9276', 'active'
UNION ALL
SELECT 'MAI', '16H-12', 'D0016H', 'active'
UNION ALL
SELECT 'MAI', '16M-1', 'D0016M', 'active'
UNION ALL
SELECT 'MAI', '16M-2', 'D0016M', 'active'
UNION ALL
SELECT 'MAI', '16M', 'D0016M', 'active'
UNION ALL
SELECT 'MAI', '16M-20', 'D0016M', 'active'
UNION ALL
SELECT 'MAI', '4408', 'LS4408', 'active'
UNION ALL
SELECT 'MAI', '2SS-27', 'D002SS', 'active'
UNION ALL
SELECT 'MAI', '2SS-20', 'D002SS', 'active'
UNION ALL
SELECT 'MAI', '2SS-28', 'D002SS', 'active'
UNION ALL
SELECT 'MAI', '2SS-12', 'D002SS', 'active'
UNION ALL
SELECT 'MAI', '8UM-1', 'D008UM', 'active'
UNION ALL
SELECT 'MAI', '8UM-20', 'D008UM', 'active'
UNION ALL
SELECT 'MAI', '8UM-2', 'D008UM', 'active'
UNION ALL
SELECT 'MAI', '8UM-12', 'D008UM', 'active'
UNION ALL
SELECT 'MAI', '8UY-1', 'D008UY', 'active'
UNION ALL
SELECT 'MAI', '8UY-2', 'D008UY', 'active'
UNION ALL
SELECT 'MAI', '8UY', 'D008UY', 'active'
UNION ALL
SELECT 'MAI', '8W6-1', 'D008W6', 'active'
UNION ALL
SELECT 'MAI', '8W6-2', 'D008W6', 'active'
UNION ALL
SELECT 'MAI', '8W6-20', 'D008W6', 'active'
UNION ALL
SELECT 'MAI', '8W6', 'D008W6', 'active'
UNION ALL
SELECT 'MAI', '79C-19', 'D0079C', 'active'
UNION ALL
SELECT 'MAI', '79C-20', 'D0079C', 'active'
UNION ALL
SELECT 'MAI', '79C', 'D0079C', 'active'
UNION ALL
SELECT 'MAI', '79C-2', 'D0079C', 'active'
UNION ALL
SELECT 'MAI', 'DK1', 'D00DK1', 'active'
UNION ALL
SELECT 'MAI', 'DK1-2', 'D00DK1', 'active'
UNION ALL
SELECT 'MAI', '4001-2', 'P45840001', 'active'
UNION ALL
SELECT 'MAI', '5004-2', 'P10255004', 'active'
UNION ALL
SELECT 'MAI', '8011-2', 'P27678011', 'active'
UNION ALL
SELECT 'MAI', '2402-2', 'P57692402', 'active'
UNION ALL
SELECT 'MAI', '9906-2', 'P57049906', 'active'
UNION ALL
SELECT 'MAI', '9023-2', 'P32679023', 'active'
UNION ALL
SELECT 'MAI', '6900-2', 'P58966900', 'active'
UNION ALL
SELECT 'MAI', '125-2', 'LEH125', 'active'
UNION ALL
SELECT 'MAI', '6001-2', 'P28596001', 'active'
UNION ALL
SELECT 'MAI', '8um-25', 'D008UM', 'active'
UNION ALL
SELECT 'MAI', '5243-1', 'LF5243', 'active'
UNION ALL
SELECT 'MAI', '5243-27', 'LF5243', 'active'
UNION ALL
SELECT 'MAI', '9276-28', 'LY9276', 'active'
UNION ALL
SELECT 'MAI', '9276-12', 'LY9276', 'active'
UNION ALL
SELECT 'MAI', '6004-2', 'P49746004', 'active'
UNION ALL
SELECT 'MAI', '15U', 'D0015U', 'active'
UNION ALL
SELECT 'MAI', '0603-2', 'P62830603', 'active'
UNION ALL
SELECT 'MAI', '8w6-10', 'D008W6', 'active'
UNION ALL
SELECT 'MAI', '5243', 'LF5243', 'active'
UNION ALL
SELECT 'MAI', 'TB-N', 'TB-N', 'active'
UNION ALL
SELECT 'MAI', 'ch9276', 'ch9276', 'active'
UNION ALL
SELECT 'MAI', '6001-1', 'P28596001', 'active'
UNION ALL
SELECT 'MAI', '6492-r', 'QC7-6492', 'active'
UNION ALL
SELECT 'MAI', '1660-1', 'QC5-1660', 'active'
UNION ALL
SELECT 'MAI', '9902-2', 'P66869902', 'active'
UNION ALL
SELECT 'MAI', '9968', 'QC8-9968', 'active'
UNION ALL
SELECT 'MAI', '977', '6A3-0977', 'active'
UNION ALL
SELECT 'MAI', 'D02N23', 'D02N23', 'active'
UNION ALL
SELECT 'MAI', 'D02N3', 'D02N3', 'active'
UNION ALL
SELECT 'MAI', '9024-1', 'P32679024', 'active'
UNION ALL
SELECT 'MAI', '5120-2', '30375120', 'active'
UNION ALL
SELECT 'MAI', '9477-2', 'QC7-9477', 'active'
UNION ALL
SELECT 'MAI', '9740-2', 'QC5-9740', 'active'
UNION ALL
SELECT 'MAI', '5140-1', '30375140', 'active'
UNION ALL
SELECT 'MAI', '6485-1', 'QC7-6485', 'active'
UNION ALL
SELECT 'MAI', '6485-2', 'QC7-6485', 'active'
UNION ALL
SELECT 'DO', '9740', 'QC5-9740', 'active'
UNION ALL
SELECT 'DO', '9740-7', 'QC5-9740', 'active'
UNION ALL
SELECT 'DO', '9740-8', 'QC5-9740', 'active'
UNION ALL
SELECT 'DO', '9740-R7', 'QC5-9740', 'active'
UNION ALL
SELECT 'DO', '9740-R4', 'QC5-9740', 'active'
UNION ALL
SELECT 'DO', '2801', 'QC3-2801', 'active'
UNION ALL
SELECT 'DO', '2801-2', 'QC3-2801', 'active'
UNION ALL
SELECT 'DO', '2801-8', 'QC3-2801', 'active'
UNION ALL
SELECT 'DO', '2801-r4', 'QC3-2801', 'active'
UNION ALL
SELECT 'DO', '2801-r7', 'QC3-2801', 'active'
UNION ALL
SELECT 'DO', '6262', 'QC4-6262', 'active'
UNION ALL
SELECT 'DO', '6262-R', 'QC4-6262', 'active'
UNION ALL
SELECT 'DO', '6262-8', 'QC4-6262', 'active'
UNION ALL
SELECT 'DO', '7133', 'QC4-7133', 'active'
UNION ALL
SELECT 'DO', '7133-8', 'QC4-7133', 'active'
UNION ALL
SELECT 'DO', '575', 'MA3-0575', 'active'
UNION ALL
SELECT 'DO', '0575-6', 'MA3-0575', 'active'
UNION ALL
SELECT 'DO', '9149', 'QC2-9149', 'active'
UNION ALL
SELECT 'DO', '598', 'QC7-0598', 'active'
UNION ALL
SELECT 'DO', '0598-8', 'QC7-0598', 'active'
UNION ALL
SELECT 'DO', '9295', 'LX9295', 'active'
UNION ALL
SELECT 'DO', '7630', 'QC4-7630', 'active'
UNION ALL
SELECT 'DO', '4563', 'QC6-4563', 'active'
UNION ALL
SELECT 'DO', '4563-1', 'QC6-4563', 'active'
UNION ALL
SELECT 'DO', '4563-8', 'QC6-4563', 'active'
UNION ALL
SELECT 'DO', '8484', 'QC4-8484', 'active'
UNION ALL
SELECT 'DO', '8485', 'QC4-8485', 'active'
UNION ALL
SELECT 'DO', '1657-lưu', 'QC5-1657', 'active'
UNION ALL
SELECT 'DO', '1657-1', 'QC5-1657', 'active'
UNION ALL
SELECT 'DO', '1657-3', 'QC5-1657', 'active'
UNION ALL
SELECT 'DO', '1660', 'QC5-1660', 'active'
UNION ALL
SELECT 'DO', '1660-lưu', 'QC5-1660', 'active'
UNION ALL
SELECT 'DO', '1660-1', 'QC5-1660', 'active'
UNION ALL
SELECT 'DO', '3880', 'QC5-3880', 'active'
UNION ALL
SELECT 'DO', '3880-8', 'QC5-3880', 'active'
UNION ALL
SELECT 'DO', '1080', 'QC5-1080', 'active'
UNION ALL
SELECT 'DO', '1090', 'QC5-1090', 'active'
UNION ALL
SELECT 'DO', '27U8', 'D027U8', 'active'
UNION ALL
SELECT 'DO', '5770', 'QC5-5770', 'active'
UNION ALL
SELECT 'DO', '5770-2', 'QC5-5770', 'active'
UNION ALL
SELECT 'DO', '5770-17', 'QC5-5770', 'active'
UNION ALL
SELECT 'DO', '5770-18', 'QC5-5770', 'active'
UNION ALL
SELECT 'DO', '5770-auto', 'QC5-5770', 'active'
UNION ALL
SELECT 'DO', '5770-7', 'QC5-5770', 'active'
UNION ALL
SELECT 'DO', '5770-r4', 'QC5-5770', 'active'
UNION ALL
SELECT 'DO', '5770-r7', 'QC5-5770', 'active'
UNION ALL
SELECT 'DO', '5861', 'QC5-5861', 'active'
UNION ALL
SELECT 'DO', '5861-8', 'QC5-5861', 'active'
UNION ALL
SELECT 'DO', '9565', 'QC5-9565', 'active'
UNION ALL
SELECT 'DO', '9565-1', 'QC5-9565', 'active'
UNION ALL
SELECT 'DO', '9565-2', 'QC5-9565', 'active'
UNION ALL
SELECT 'DO', '8234', 'QC6-8234', 'active'
UNION ALL
SELECT 'DO', '8235', 'QC6-8235', 'active'
UNION ALL
SELECT 'DO', '6773', 'QC6-6773', 'active'
UNION ALL
SELECT 'DO', '6773-2', 'QC6-6773', 'active'
UNION ALL
SELECT 'DO', '6270', 'QC7-6270', 'active'
UNION ALL
SELECT 'DO', '6270-7', 'QC7-6270', 'active'
UNION ALL
SELECT 'DO', '6270-8', 'QC7-6270', 'active'
UNION ALL
SELECT 'DO', '6270-r4', 'QC7-6270', 'active'
UNION ALL
SELECT 'DO', '6270-r7', 'QC7-6270', 'active'
UNION ALL
SELECT 'DO', '6270-17', 'QC7-6270', 'active'
UNION ALL
SELECT 'DO', '6270-18', 'QC7-6270', 'active'
UNION ALL
SELECT 'DO', '6270-19', 'QC7-6270', 'active'
UNION ALL
SELECT 'DO', '8052', 'QC7-8052', 'active'
UNION ALL
SELECT 'DO', '8052-3', 'QC7-8052', 'active'
UNION ALL
SELECT 'DO', '8052-4', 'QC7-8052', 'active'
UNION ALL
SELECT 'DO', '5091', 'FL4-5091', 'active'
UNION ALL
SELECT 'DO', '5092', 'FL4-5092', 'active'
UNION ALL
SELECT 'DO', '9477', 'QC7-9477', 'active'
UNION ALL
SELECT 'DO', '9477-8', 'QC7-9477', 'active'
UNION ALL
SELECT 'DO', '9477-r4', 'QC7-9477', 'active'
UNION ALL
SELECT 'DO', '9477-r7', 'QC7-9477', 'active'
UNION ALL
SELECT 'DO', '6485', 'QC7-6485', 'active'
UNION ALL
SELECT 'DO', '6486', 'QC7-6486', 'active'
UNION ALL
SELECT 'DO', '6487', 'QC7-6487', 'active'
UNION ALL
SELECT 'DO', '6488', 'QC7-6488', 'active'
UNION ALL
SELECT 'DO', '6489', 'QC7-6489', 'active'
UNION ALL
SELECT 'DO', '6490', 'QC7-6490', 'active'
UNION ALL
SELECT 'DO', '6491', 'QC7-6491', 'active'
UNION ALL
SELECT 'DO', '6492', 'QC7-6492', 'active'
UNION ALL
SELECT 'DO', '6493', 'QC7-6493', 'active'
UNION ALL
SELECT 'DO', '6494', 'QC7-6494', 'active'
UNION ALL
SELECT 'DO', '6495', 'QC7-6495', 'active'
UNION ALL
SELECT 'DO', 't-6486', 't-6486', 'active'
UNION ALL
SELECT 'DO', 't-6487', 't-6487', 'active'
UNION ALL
SELECT 'DO', 't-6488', 't-6488', 'active'
UNION ALL
SELECT 'DO', 't-6489', 't-6489', 'active'
UNION ALL
SELECT 'DO', 't-6490', 't-6490', 'active'
UNION ALL
SELECT 'DO', 't-6491', 't-6491', 'active'
UNION ALL
SELECT 'DO', 't-6492', 't-6492', 'active'
UNION ALL
SELECT 'DO', 't-6493', 't-6493', 'active'
UNION ALL
SELECT 'DO', 't-6494', 't-6494', 'active'
UNION ALL
SELECT 'DO', 't-6495', 't-6495', 'active'
UNION ALL
SELECT 'DO', '127-2', 'LEM127', 'active'
UNION ALL
SELECT 'DO', '8um-l', 'D008UM', 'active'
UNION ALL
SELECT 'DO', '9140', 'LY9140', 'active'
UNION ALL
SELECT 'DO', '127-4', 'LEM127', 'active'
UNION ALL
SELECT 'DO', '127', 'LEM127', 'active'
UNION ALL
SELECT 'DO', '5243', 'LF5243', 'active'
UNION ALL
SELECT 'DO', '125', 'LEH125', 'active'
UNION ALL
SELECT 'DO', '8um', 'D008UM', 'active'
UNION ALL
SELECT 'DO', '8014', 'LY8014', 'active'
UNION ALL
SELECT 'DO', '2173', 'LY2173', 'active'
UNION ALL
SELECT 'DO', '4258', 'LY4258', 'active'
UNION ALL
SELECT 'DO', '4258-2', 'LY4258', 'active'
UNION ALL
SELECT 'DO', '8uy', 'D008UY', 'active'
UNION ALL
SELECT 'DO', '1404', 'LP1404', 'active'
UNION ALL
SELECT 'DO', '9276', 'LY9276', 'active'
UNION ALL
SELECT 'DO', 'gfm', 'D00GFM', 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE product_code=VALUES(product_code), status='active' ;

INSERT INTO product_aliases (process_id, alias_code, product_code, status)
SELECT p.id, s.alias_code, s.product_code, 'active'
FROM (
SELECT 'DO' AS `process_code`, '9116-12' AS `alias_code`, 'LY9116' AS `product_code`, 'active' AS `status`
UNION ALL
SELECT 'DO', '9116', 'LY9116', 'active'
UNION ALL
SELECT 'DO', '127-1', 'LEM127', 'active'
UNION ALL
SELECT 'DO', '15u', 'D0015U', 'active'
UNION ALL
SELECT 'DO', '2168', 'LY2168', 'active'
UNION ALL
SELECT 'DO', '4408', 'LS4408', 'active'
UNION ALL
SELECT 'DO', '8w6', 'D008W6', 'active'
UNION ALL
SELECT 'DO', '6E', 'D0006E', 'active'
UNION ALL
SELECT 'DO', '123', 'LEH123', 'active'
UNION ALL
SELECT 'DO', '79c', 'D0079C', 'active'
UNION ALL
SELECT 'DO', 'dk1', 'D00DK1', 'active'
UNION ALL
SELECT 'DO', 'dk1-l', 'D00DK1', 'active'
UNION ALL
SELECT 'DO', '6001', 'P28596001', 'active'
UNION ALL
SELECT 'DO', '6900', 'P58966900', 'active'
UNION ALL
SELECT 'DO', '9906', 'P57049906', 'active'
UNION ALL
SELECT 'DO', '8011', 'P27678011', 'active'
UNION ALL
SELECT 'DO', '4001', 'P45840001', 'active'
UNION ALL
SELECT 'DO', '2402', 'P57692402', 'active'
UNION ALL
SELECT 'DO', '5004', 'P10255004', 'active'
UNION ALL
SELECT 'DO', '16d', 'D0016D', 'active'
UNION ALL
SELECT 'DO', '16m', 'D0016M', 'active'
UNION ALL
SELECT 'DO', '16h', 'D0016H', 'active'
UNION ALL
SELECT 'DO', 'pk', 'D000PK', 'active'
UNION ALL
SELECT 'DO', 'd49', 'D00049', 'active'
UNION ALL
SELECT 'DO', '49', 'D00049', 'active'
UNION ALL
SELECT 'DO', '79c-1', 'D0079C', 'active'
UNION ALL
SELECT 'DO', '603', 'P62830603', 'active'
UNION ALL
SELECT 'DO', '9255', '4P089255', 'active'
UNION ALL
SELECT 'DO', 'CH9276-1', 'CH9276-1', 'active'
UNION ALL
SELECT 'DO', '9116-4', 'LY9116', 'active'
UNION ALL
SELECT 'DO', '6004', 'P49746004', 'active'
UNION ALL
SELECT 'DO', 'AQL9276', 'AQL9276', 'active'
UNION ALL
SELECT 'DO', '9140-4', 'LY9140', 'active'
UNION ALL
SELECT 'DO', 'KCN', 'D01KCN', 'active'
UNION ALL
SELECT 'DO', 'KCT', 'D01KCT', 'active'
UNION ALL
SELECT 'DO', 'NKCT', 'NKCT', 'active'
UNION ALL
SELECT 'DO', '5770-12', 'QC5-5770', 'active'
UNION ALL
SELECT 'DO', '1657-2', 'QC5-1657', 'active'
UNION ALL
SELECT 'DO', '1660-2', 'QC5-1660', 'active'
UNION ALL
SELECT 'DO', '9902', 'P66869902', 'active'
UNION ALL
SELECT 'DO', 'D027U8', 'D027U8', 'active'
UNION ALL
SELECT 'DO', '9968', 'QC8-9968', 'active'
UNION ALL
SELECT 'DO', '0977-6', '6A3-0977', 'active'
UNION ALL
SELECT 'DO', 'D02N23', 'D02N23', 'active'
UNION ALL
SELECT 'DO', '5770-r19', 'QC5-5770', 'active'
UNION ALL
SELECT 'DO', '5120', '30375120', 'active'
UNION ALL
SELECT 'DO', 'D02N3', 'D02N3', 'active'
UNION ALL
SELECT 'DO', '9024', 'P32679024', 'active'
UNION ALL
SELECT 'DO', '5140', '30375140', 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE product_code=VALUES(product_code), status='active' ;

-- ============================================================================
-- 4. ĐỊNH MỨC BIẾN THỂ - GIỮ NGUYÊN SỐ THẬP PHÂN
-- ============================================================================
INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'EP' AS `process_code`, 'ÉP' AS `work_type`, 'D006P-2' AS `product_code`, 617.1 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'ĐỊNH MỨC sx1' AS `source_sheet`, 5 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'EP', 'ÉP', '15U-2', 560.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'LWL9-2', 370.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '7236', 1066.39, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'Y225', 201.6, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'GRIP50', 10.2, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6035', 57.6, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '2125', 1920.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'E393', 748.8, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '245', 130.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '2SV-2', 629.2, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '247-2', 151.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '5091', 480.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '5092', 480.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6489', 309.76, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6396', 716.8, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '3035-1', 249.6, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '3035-2', 289.92, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'YYU-2', 1037.66, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'KEY RUBBE', 7.272727, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'LWL12', 370.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'N23', 806.4, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'GRIP65', 11.82, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'E503', 218.4, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '9902', 75.2, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '15U-3', 560.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '8016', 724.2, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '9436-2', 767.52, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '5140', 96.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'TBN-47', 600.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '3880', 1985.5, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6773', 1014.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '7630', 673.1, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '1657', 490.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '0575', 460.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '1080-2', 744.48, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '1090', 1236.48, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6900', 57.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '125', 510.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '5120', 144.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '4305', 56.4, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'J84', 720.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'UY-2', 1048.5, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '2252', 261.12, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '3031', 279.18, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'J498', 735.84, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '262606', 2000.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '262607', 2544.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '252911', 2544.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '2209', 1725.44, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '2165', 1664.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '9436-3', 767.52, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'SU530', 110.4, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '8234', 1244.25, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '8235', 1165.5, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '234', 136.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'S1', 72.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'S6', 979.2, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'S7', 688.8, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'S17', 84.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '27UA', 1260.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'S19', 672.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6492', 1387.2, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6003', 54.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '9665', 628.8, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'E-2556', 285.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '9118-4', 1014.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6491', 1387.2, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'E-7236', 900.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'E409', 140.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'E-KCT', 210.0, 0, 'ĐỊNH MỨC sx1', 5, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '57.599999999999994', 6328.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '1920', 9906.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '748.80000000000007', 40001.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '130', 2402.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '629.20000000000005', 603.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '309.76', 68.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '249.60000000000002', 6270.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '560', 8484.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '767.52', 9024.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '96', 6495.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '600', 6494.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '1985.5', 6485.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '1014', 6488.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '673.1', 6487.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '490.00000000000006', 3002.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '459.99999999999994', 161.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '744.48', 911.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '57', 8052.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '509.99999999999994', 1432.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '261.12', 9295.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '2000', 6044.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '2544', 1404.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '1725.44', 6493.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '1664', 4408.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '110.39999999999999', 6004.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '979.19999999999993', 559.0, 0, 'ĐỊNH MỨC sx1', 6, 'active'
UNION ALL
SELECT 'EP', 'L918', 'L918', 443.2, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '0696-1', 734.4, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '0696-2', 734.4, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '0696-3', 734.4, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SU8000', 22.02, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SU520', 28.8, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6328', 500.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '9906', 72.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '40001', 72.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '2402', 47.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '603', 57.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'L919', 498.6, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET-G', 540.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'TOPHOLDER', 100.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '68', 6.363636, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET175-H', 540.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6270', 1418.24, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET-D', 540.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET-H', 540.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET-E', 540.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET-C', 534.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET175-E', 540.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET175-C', 534.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6490-1', 396.9, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'MR05', 31.8, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '8484', 861.9, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '9142-3', 1064.7, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6486', 1228.8, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6495', 1387.2, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6494', 1387.2, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6485', 172.8, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6488', 309.12, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6487', 300.8, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '3002', 190.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '161', 460.8, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '911', 2800.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6490-2', 396.9, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '8052', 1037.66, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '1432', 1032.59, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'GYX', 1308.16, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'UM-2', 1039.5, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'YYU-3', 1060.982, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '7236-4', 1066.39, 0, 'ĐỊNH MỨC sx1', 7, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'EP' AS `process_code`, 'L918' AS `work_type`, '9295' AS `product_code`, 900.77 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'ĐỊNH MỨC sx1' AS `source_sheet`, 7 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'EP', 'L918', '129-3', 1064.7, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET175-D', 540.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6044', 1418.24, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '8500', 591.5, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '1404', 738.1, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6493', 1384.31, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '4408', 705.43, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '9024', 57.6, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '6004', 75.2, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'S18', 89.6, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'KCN', 1152.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SATO', 22.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '9436-4', 767.52, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', '559', 43.65, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'P-1080', 80.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-1080', 200.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-9142', 210.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-3880', 285.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-9276', 1360.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-KCT', 200.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-2SS', 400.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-15U', 600.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-9116', 150.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-1657', 150.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-8UY', 300.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-8UM', 300.0, 0, 'ĐỊNH MỨC sx1', 7, 'active'
UNION ALL
SELECT 'EP', '443.2', '396.90000000000003', 2402.0, 0, 'ĐỊNH MỨC sx1', 8, 'active'
UNION ALL
SELECT 'EP', '443.2', '540', 161.0, 0, 'ĐỊNH MỨC sx1', 8, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9431', 68.5, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9628', 80.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9630', 80.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9437', 53.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9435', 48.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9629', 53.5, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'KRE40LGB', 43.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9669', 68.5, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'ST0003', 40.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'N2710', 66.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'E2500', 66.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'SI0464', 90.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'SI0465', 91.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'SI0587', 91.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'CÂN EP9431', 60.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'RBB-2881-30', 10.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9450', 52.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'SI0463', 90.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'E2710', 41.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'SI9438', 90.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'TPW98', 48.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'TPW130', 48.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'TPW225', 48.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'CAT YYU#3', 35.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'TEW122', 53.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'CAT L918', 1.25, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'CAT S6', 7.5, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'CAT L919', 1.25, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'SI0001', 45.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EPDM50', 53.0, 0, 'ĐỊNH MỨC sx1', 9, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'EP0010', 68.5, 0, 'ĐỊNH MỨC sx1', 11, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'TE-1322', 58.0, 0, 'ĐỊNH MỨC sx1', 11, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'CAT 174', 41.0, 0, 'ĐỊNH MỨC sx1', 11, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'SILICONE', 20.0, 0, 'ĐỊNH MỨC sx1', 11, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'IT0006', 70.0, 0, 'ĐỊNH MỨC sx1', 11, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'S6', 20.0, 0, 'ĐỊNH MỨC sx1', 11, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'S7', 20.0, 0, 'ĐỊNH MỨC sx1', 11, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'S1', 20.0, 0, 'ĐỊNH MỨC sx1', 11, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'CAT 175', 41.0, 0, 'ĐỊNH MỨC sx1', 11, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', 'lwl9 sơn', 250.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', 'lwl12 sơn', 230.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '2606 L2', 12000.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '2606 L1', 12000.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '6003 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9900 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9024 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9500 SƠN', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '5140 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9300 SƠN', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '80000 SƠN', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '5150 SƠN', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '6100 SƠN', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '8200 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9023 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '6900 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9906 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '4408 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '40001 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '6004 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '2402 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '0603 sơn', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '6000 SƠN', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '5120 SƠN', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '4100 SƠN', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '5800 SƠN', 140.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '245', 220.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '5600 SƠN', 140.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9902 SƠN', 160.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '4001 SƠN', 80.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '3901 SƠN', 150.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '6036', 300.0, 0, 'Định mức XLBV', 5, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'LWL9', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'LWL12', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '2125', 15000.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '2165', 4250.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6003', 85.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9900', 85.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 's19', 350.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9024', 80.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 's9', 100.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'GRIP 50', 50.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'mr05', 160.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '3749', 150.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '911', 8500.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '15u', 500.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'g69', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6485', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6491', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '1404', 1000.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '5243', 620.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6E', 450.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'E503', 90.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'E393', 300.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'E409', 300.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '3002', 500.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '0696', 930.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '3031', 500.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9665', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'su520', 500.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'YYU', 850.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '559', 300.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'L919', 320.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 's17', 250.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'SU530', 250.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9023', 80.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6900', 85.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '8500', 330.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9436', 450.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '7236#3', 1000.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6493', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 's6', 1500.0, 0, 'Định mức XLBV', 7, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'XLBV' AS `process_code`, 'XLBV' AS `work_type`, '9906' AS `product_code`, 75.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'Định mức XLBV' AS `source_sheet`, 7 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'XLBV', 'XLBV', 'L918', 280.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9295', 1400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 's1', 40.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6492', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '4408', 500.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'J498', 900.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 's7', 450.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '40001', 75.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '247', 250.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '2252', 520.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '3035', 520.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6004', 85.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '2402', 85.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6494', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6486', 300.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6487', 300.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'UY', 350.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '2SV', 450.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6495', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '2209', 8500.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '161', 170.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6489', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6396', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '174', 300.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '175', 290.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6490', 260.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6488', 250.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '0603', 80.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '5092', 1000.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '5120', 90.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6270', 2500.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'S18', 400.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '52675', 100.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'SU8000', 100.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9902', 85.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '3880', 2500.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '5140', 90.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '4305', 85.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '4305 sơn', 160.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '4001', 80.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '3901', 80.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'TOP HOLDER', 100.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6035', 100.0, 0, 'Định mức XLBV', 7, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '2125 L2', 14000.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', 'Y225', 350.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '9500', 60.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6044', 2000.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '9300', 80.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '80000', 60.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', 'D02DFV', 80.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', 'GRIP SI', 50.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', 'MR237', 300.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6100', 60.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '1090', 2000.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '5150', 90.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6491 VN', 650.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '5243 NGOÀI', 1000.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '8200', 80.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '1400', 1000.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '0696 TÁCH', 1500.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '3031 VN', 600.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6493 VN', 650.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6492 VN', 650.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '2252 VN', 900.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '3035 VN', 900.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6494 VN', 650.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6486 VN', 700.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6487 VN', 500.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '2SV VN', 1000.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6495 VN', 650.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '2209 L2', 10000.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6489 VN', 500.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6396 VN', 700.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '174 VN', 800.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '175 VN', 700.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6490 VN', 450.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6488 VN', 450.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6000', 80.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '4100', 80.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '5800', 80.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '234', 220.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '5600', 80.0, 0, 'Định mức XLBV', 9, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'S19VIA', 135.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', '174-B1', 120.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'GRIP', 30.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'CẠO TRỤC TÁI', 25.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'GRIP-CAM', 15.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'E503 VIA', 50.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'E393 VIA', 150.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'E409 VIA', 150.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', '0696 VIA', 450.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'YYU VIA', 400.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'SOCKET CHECK', 1000.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', '7236-4', 1200.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'S6 VIA', 250.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'L918 VIA', 200.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'S1 VIA', 20.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'J498 VIA', 300.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', '6396 VIA', 300.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', '6490 VIA', 180.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'GIA LƯU', 1.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'TBN-47', 400.0, 0, 'Định mức XLBV', 11, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG DO KHUÔN', '0696-1', 600.0, 0, 'Định mức XLBV', 13, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG DO KHUÔN', '7236-2', 2000.0, 0, 'Định mức XLBV', 13, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG DO KHUÔN', '174-e', 330.0, 0, 'Định mức XLBV', 13, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG DO KHUÔN', 'CÔNG ĐOẠN', 1.0, 0, 'Định mức XLBV', 13, 'active'
UNION ALL
SELECT 'XLBV', 'BẮN CÁT', '3031 check', 700.0, 0, 'Định mức XLBV', 15, 'active'
UNION ALL
SELECT 'XLBV', 'BẮN CÁT', '174 VÒI', 800.0, 0, 'Định mức XLBV', 15, 'active'
UNION ALL
SELECT 'XLBV', 'BẮN CÁT', '175 VÒI', 800.0, 0, 'Định mức XLBV', 15, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6485 CHECK', 900.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6491 CHECK', 3000.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '3002 LAU', 600.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6493 CHECK', 3000.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6492 check', 3000.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '247 CHECK', 350.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '2252 CHECK', 1540.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '3035 CHECK', 1540.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6494 CHECK', 3000.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6486 CHECK', 3000.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6487 CHECK', 900.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6495 CHECK', 3000.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6489 CHECK', 900.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6490 CHECK', 900.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6488 CHECK', 900.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '1080 CHECK', 3000.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '8016 check', 2000.0, 0, 'Định mức XLBV', 17, 'active'
UNION ALL
SELECT 'XLBV', 'DẬP', '3002 KHOAN', 140.0, 0, 'Định mức XLBV', 19, 'active'
UNION ALL
SELECT 'XLBV', 'DẬP', '3031 DẬP MÁY', 400.0, 0, 'Định mức XLBV', 19, 'active'
UNION ALL
SELECT 'XLBV', 'DẬP', '2252 DẬP MÁY', 300.0, 0, 'Định mức XLBV', 19, 'active'
UNION ALL
SELECT 'XLBV', 'DẬP', '174 DẬP', 530.0, 0, 'Định mức XLBV', 19, 'active'
UNION ALL
SELECT 'XLBV', 'DẬP', '175 DẬP', 530.0, 0, 'Định mức XLBV', 19, 'active'
UNION ALL
SELECT 'XLBV', 'LỖ KHÍ', 'lwl9 lk', 800.0, 0, 'Định mức XLBV', 21, 'active'
UNION ALL
SELECT 'XLBV', 'LỖ KHÍ', 'lwl12 lk', 1000.0, 0, 'Định mức XLBV', 21, 'active'
UNION ALL
SELECT 'XLBV', 'LỖ KHÍ', '3031 LK', 820.0, 0, 'Định mức XLBV', 21, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', 'BÓC PHÔI TÁI', 1000.0, 0, 'Định mức XLBV', 23, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', 'bắn phôi', 3000.0, 0, 'Định mức XLBV', 23, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', 'bắn trục', 300.0, 0, 'Định mức XLBV', 23, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6491 LT MÁY', 1500.0, 0, 'Định mức XLBV', 23, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '3031 L-JIC', 1300.0, 0, 'Định mức XLBV', 23, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'XLBV' AS `process_code`, 'TRÊN MÁY' AS `work_type`, '6493 LT MÁY' AS `product_code`, 1500.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'Định mức XLBV' AS `source_sheet`, 23 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6492 LT MÁY', 1500.0, 0, 'Định mức XLBV', 23, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6494 LT MÁY', 1000.0, 0, 'Định mức XLBV', 23, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6486 LT MÁY', 1000.0, 0, 'Định mức XLBV', 23, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6495 LT MÁY', 1000.0, 0, 'Định mức XLBV', 23, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6396 VN MÁY', 2000.0, 0, 'Định mức XLBV', 23, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6491 LT', 1000.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '3002 LT', 380.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '3031 LT', 590.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6493 LT', 1000.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6492 LT', 1000.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '2252 LT', 930.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '3035 LT', 930.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6494 LT', 1000.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6486 LT', 600.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6487 LT', 600.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '2SV LT', 1000.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6495 LT', 1000.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '2209 L1', 15000.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6489 LT', 600.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6490 LT', 600.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6488 LT', 600.0, 0, 'Định mức XLBV', 25, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6485 ngoài', 600.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6491 ngoài', 700.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '3031 KHOAN', 140.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', 'yyu ngoài', 1000.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '9436 ngoài', 500.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '7236 ngoài', 1000.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6493 ngoài', 700.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', 'S6 NGOÀI', 1500.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', 'N23', 1000.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '9295 ngoài', 700.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', 's1 ngoài', 100.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6492 ngoài', 700.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '4408 NGOÀI', 1000.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', 's7 ngoài', 600.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6494 ngoài', 700.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6486 ngoài', 650.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6487 ngoài', 600.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', 'uy ngoài', 500.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '2sv ngoài', 700.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6495 ngoài', 700.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6489 ngoài', 600.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '174 ngoài', 380.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '175 ngoài', 380.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6490 ngoài', 600.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6488 ngoài', 600.0, 0, 'Định mức XLBV', 27, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2556-2', 7200.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2556-11', 6600.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2556-8', 5600.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2556-9', 5000.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C2556-auto', 5000.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2821', 2400.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2822', 2400.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8484', 2400.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8485', 2400.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3880-2', 7200.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c0977', 1460.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3880-8', 5600.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3880-9', 5000.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c9149', 6000.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c0575', 1460.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3438', 2600.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c1080', 1800.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c1090', 2000.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c1657', 2600.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c5770-9', 6400.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c7630', 5000.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c5770', 8000.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8052', 5800.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C5770-1', 4800.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8234', 2400.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8235', 2400.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6773', 4000.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', '5243-l', 182.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'cpk-r', 2415.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c125', 2106.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c7236', 900.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2453', 2130.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c79c', 2415.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c79c-3', 3066.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'cdk1', 2415.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c4268', 2415.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8016', 4088.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c129', 3105.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c9118', 2800.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c9142', 4088.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c7236-2', 500.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c1432', 800.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c4268-3', 2715.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C129-13', 2415.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8um', 2415.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c9118-13', 2415.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8um-3', 2415.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'ckcn', 2250.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'cd027u8', 1440.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C8016-12', 3220.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8um-t', 1610.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8uy', 850.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2401', 1440.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2411', 850.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3301', 850.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'CD02N23', 900.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'CD02N3C', 2415.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'CD02N3F', 2415.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c9520', 7200.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8052-auto', 4500.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6491', 1525.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'Cgyx-auto', 6000.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C7630-11', 6600.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3880-auto', 4500.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C5770-auto', 6660.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3880-11', 6600.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'Cj84', 2400.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C6494-t', 812.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C502', 1560.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c9149-1', 4480.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C6485', 1525.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6486', 1625.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6487', 1525.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6488', 1525.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6489', 1525.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6490', 1525.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6492', 1625.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6493', 1625.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6494', 1625.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6495', 1625.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'CGYX-9', 6080.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'CGYX', 7500.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'cgyx-1', 4480.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C8052-1', 3600.0, 0, 'Gia công', 5, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9740', 420.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2801', 605.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6262', 420.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '598', 420.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '7133', 605.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8484', 540.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8485', 570.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '4563', 605.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '3880', 400.0, 0, 'Gia công', 7, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'GC' AS `process_code`, 'Lồng' AS `work_type`, '7960' AS `product_code`, 300.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'Gia công' AS `source_sheet`, 7 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'GC', 'Lồng', '9149', 360.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '575', 300.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '3438', 420.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '1080', 660.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '1090', 660.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '1657', 90.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '1660', 90.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '7630', 180.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '5770-T', 420.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '5861', 605.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9565', 200.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8234', 660.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8235', 660.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6773', 120.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8052', 36.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '4408-T', 162.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '4408-L', 162.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '5243', 615.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '123', 320.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '125', 280.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '7236', 690.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2168', 600.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2173', 600.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'D02N3C', 335.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'D02N3F', 335.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '4258', 335.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8014', 550.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '127', 500.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9116', 300.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9140', 500.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9276', 500.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'd0049', 430.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8w6', 335.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'gfm', 510.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'd49', 355.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '15u-l', 180.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8011', 200.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '1432-kt', 600.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '15u-t', 180.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'd02n23', 120.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6001', 160.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2ss', 400.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9140-3', 350.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6e', 160.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '16h', 250.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8uy', 250.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'pk', 335.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '16d', 335.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '16m', 335.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6e-c1', 210.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6e-c2', 210.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6e/2', 160.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '127-t', 160.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8um', 350.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '16m-1', 350.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8w6-1', 335.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2495', 350.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9140-1', 180.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'gfm-3', 400.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'kct', 335.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'kcn', 550.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '4408', 500.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '15U', 600.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9295-T', 180.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9295-L', 180.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9295', 550.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'D027U8', 120.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'LDD027U8', 1350.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '3301-L', 180.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '3301-T', 180.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '3311', 600.0, 0, 'Gia công', 7, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LTX', 840.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'DF', 660.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LD7630', 300.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LD6773', 300.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'Sàng 2556', 54000.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'Sàng 3880', 60000.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'đg cs', 80000.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'đh0575', 1100.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'f0575', 1200.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', '977', 300.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld0977', 300.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld9149', 480.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld0575', 300.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LD123', 800.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld8w6', 1000.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LD16M', 800.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld9565', 200.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', '5243-t', 182.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld8014', 1300.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld127', 1300.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld9140', 1300.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld15u', 1200.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ldgfm', 1300.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LDDK1', 500.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LD9116', 800.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld16h', 1000.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld8uy', 1000.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld8um', 800.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'NẮN S', 350.0, 0, 'Gia công', 9, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6486', 4350.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6487', 1920.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6488', 1920.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6489', 1700.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6490', 1920.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6491', 1920.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6492', 3720.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6493', 4500.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6494', 4500.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6495', 3720.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6485', 1700.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6486', 13500.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6487', 2700.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6488', 2700.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6489', 2700.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6490', 2700.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6492', 9600.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6493', 9600.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6494', 9600.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6495', 9600.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'c9503', 1680.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'c1467', 1800.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'f6495', 1500.0, 0, 'Gia công', 13, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9477', 605.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '5770', 605.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6270', 605.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '5091', 600.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9968', 605.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '5092', 36.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'đo 5092', 216.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'ch gyx', 20000.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '1404', 350.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'c1404', 600.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6495-l', 1000.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6494-l', 1000.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6485-L', 470.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6487-l', 470.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6488-L', 470.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6490-L', 470.0, 0, 'Gia công', 15, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'GC' AS `process_code`, 'Lồng' AS `work_type`, 'check pic up' AS `product_code`, 1500.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'Gia công' AS `source_sheet`, 15 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'GC', 'Lồng', 'check 6488', 1100.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6486-m', 1400.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6494-m', 1450.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6495-m', 1450.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6493-l', 1000.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6492-l', 1000.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6492-m', 1450.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6489-l', 450.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6240', 420.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '0977-m', 200.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'check 6490', 1100.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'check 6489', 1100.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6491', 600.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6493-m', 1450.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'sàng cs 5770', 30000.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'CH5770', 15000.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'C9149-AUTO', 6000.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6491-L', 750.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'thổi pic up', 5500.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2421', 160.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2431', 250.0, 0, 'Gia công', 15, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'bavia 5770', 15000.0, 0, 'Gia công', 17, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'bavia gyx', 15000.0, 0, 'Gia công', 17, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'bavia 2556', 15000.0, 0, 'Gia công', 17, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'bavia 3880', 15000.0, 0, 'Gia công', 17, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'AQL9295', 1650.0, 0, 'Gia công', 17, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'AQL15u', 1650.0, 0, 'Gia công', 17, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'AQL9276', 1300.0, 0, 'Gia công', 17, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'AQL8UY', 1800.0, 0, 'Gia công', 17, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'tuốtkct', 530.0, 0, 'Gia công', 17, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9740', 175.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '2801', 160.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6262', 180.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '7133', 180.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9149', 185.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '598', 175.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '7630', 70.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '4563', 180.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8484', 125.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8485', 125.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '3880', 180.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1080', 120.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1080-G30', 180.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1090', 125.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1090-G30', 180.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1090-12', 195.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1080-12', 190.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1080-14', 120.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1080-17', 120.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1090-14', 120.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1090-17', 120.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '5770', 180.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8234', 125.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8235', 125.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6270', 180.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '5091', 85.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '5092', 85.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9477', 180.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9565-1', 170.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9565-2', 170.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '0575-1', 200.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '0575-2', 145.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6773-1', 170.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6773-2', 170.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8052-1', 110.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8052-2', 110.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8052-3', 110.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6486-1', 3920.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6486-2', 2800.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6487-1', 1440.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6487-2', 1320.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6488-1', 1260.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6488-2', 1200.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6489-1', 840.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6489-2', 770.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6490-1', 1968.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6490-2', 1440.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6492-1', 2520.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6492-2', 1800.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6492-r', 1800.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6493-1', 2800.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6493-2', 2000.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6493-r', 2000.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6494-1', 2800.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6494-2', 2000.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6494-r', 2000.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6495-1', 2520.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6495-2', 1800.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6495-r', 1800.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1657-phá', 110.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1657-1', 85.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1657-2', 85.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1660-phá', 110.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1660-1', 85.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1660-2', 85.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '0598-1', 210.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '0598-2', 200.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '5770-1', 210.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '5770-2', 200.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9149-1', 240.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9149-2', 200.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6491-1', 12000.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6491-2', 10000.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6485-1', 840.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6485-2', 700.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '7630-1', 150.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '7630-2', 150.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9477-2', 200.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9477-1', 210.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '4563-1', 210.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '4563-2', 200.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9968', 180.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9968-1', 210.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9968-2', 200.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '977', 90.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '575', 90.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6328', 51.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6330', 51.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9740-1', 210.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9740-2', 200.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '7133-1', 210.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '7133-2', 200.0, 0, 'mài đo', 5, 'active'
UNION ALL
SELECT 'MAI', '123-1', '123-1', 250.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '123-2', 210.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '125-1', 220.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9276-20', 500.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9276-15', 350.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9276-2', 210.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9276', 260.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5.9999999999999998E-30', 211.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6E/2', 210.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6E', 270.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'PK-1', 266.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'PK-2', 210.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16D-1', 266.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16D-2', 210.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16D-20', 350.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16H-2', 210.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16h', 360.0, 0, 'mài đo', 7, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'MAI' AS `process_code`, '123-1' AS `work_type`, '9276-7' AS `product_code`, 300.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'mài đo' AS `source_sheet`, 7 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'MAI', '123-1', '16H-12', 310.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16M-1', 250.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16M-2', 210.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16M-20', 330.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2SS-27', 400.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2SS-20', 370.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2SS-28', 400.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2SS-12', 330.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UM-1', 230.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UM-2', 200.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UM-12', 250.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UM-20', 330.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UY-1', 270.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UY-2', 210.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UY', 380.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8W6-1', 230.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8W6-2', 200.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8W6-20', 330.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8W6', 190.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '79C-19', 350.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '79C-20', 470.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '79C', 270.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '79C-2', 210.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'DK1-1', 250.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'DK1-2', 210.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '4001-1', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '4001-2', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5004-1', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5004-2', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8011-1', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '4408', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8011-2', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2402-1', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2402-2', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9906-1', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9906-2', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6900-1', 110.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6900-2', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '125-2', 200.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6001-2', 100.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8um-25', 180.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5243-1', 180.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9276-28', 420.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6004-1', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6004-2', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '15U', 130.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '0603-1', 100.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '0603-2', 100.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8w6-10', 200.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5243', 130.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'TB-S', 1200.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'TB-N', 2000.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'ch9276', 2000.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9902-1', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9902-2', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9295', 130.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5120-1', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5120-2', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2421', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2431', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '3311', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9024-1', 110.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9024-2', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UY-20', 350.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3C-27', 230.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3F-27', 230.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5140-1', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5140-2', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '4305-1', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '4305-2', 120.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'sato-tb', 800.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3C-20', 320.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3F-20', 320.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3C-2', 210.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3F-1', 240.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3C-1', 240.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3F-2', 210.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9500-1', 100.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9500-2', 100.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'tb-sato', 800.0, 0, 'mài đo', 7, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9740', 380.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9740-7', 260.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '2801', 380.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '2801-8', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6262', 380.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6262-8', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '7133', 380.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '7133-8', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '575', 550.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '0575-6', 280.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9149', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '598', 380.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '0598-8', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '7630', 150.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '4563', 380.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '4563-8', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8484', 850.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8485', 900.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1657', 80.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1657-1', 85.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1657-2', 85.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1660', 85.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1660-1', 85.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1660-2', 85.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1657-LƯU', 23.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1660-LƯU', 23.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '3880', 380.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '3880-8', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1080', 800.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1090', 850.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770', 380.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770-7', 260.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9565', 160.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9565-1', 300.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9565-2', 300.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8234', 850.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8235', 900.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6773', 120.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6773-1', 240.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6773-2', 240.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6270', 380.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6270-8', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9968', 380.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8052', 80.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8052-1', 120.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8052-2', 120.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8052-3', 120.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8052-LƯU', 60.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5091', 280.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5092', 90.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9477', 380.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9477-8', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6485', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6486', 600.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6487', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6488', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6489', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6490', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6491', 600.0, 0, 'mài đo', 9, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'DO' AS `process_code`, 'ĐO' AS `work_type`, '6492' AS `product_code`, 600.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'mài đo' AS `source_sheet`, 9 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'DO', 'ĐO', '6493', 600.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6494', 600.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6495', 600.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 's7630', 800.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 's6773', 800.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 's9565', 800.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'S1657', 500.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 's1660', 500.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 's9149', 1000.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'NẮN+LD', 250.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'NẮN', 300.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'NẮNK', 80.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'nắn 7630', 185.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'nắn 6773', 185.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'NẮN 9565', 185.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '0977-6', 280.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '977', 550.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770-r4', 260.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770-r7', 260.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770-r19', 220.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770-r20', 265.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770-r21', 235.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '2801-r4', 260.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '2801-r7', 260.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9740-r19', 220.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6270-r7', 260.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9477-r7', 260.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'TB0575', 600.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6486', 13500.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6487', 2700.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6488', 2700.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6489', 2700.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6490', 2700.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6492', 9000.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6493', 11000.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6494', 9600.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6495', 9600.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb0977', 600.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'rh ej', 720.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'rh df', 500.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'rh pk', 720.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb8484', 1500.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb8485', 1800.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb1080', 1200.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb1090', 1500.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb8234', 1800.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb8235', 1800.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb5092', 720.0, 0, 'mài đo', 9, 'active'
UNION ALL
SELECT 'DO', '127-2', '127-2', 598.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '8um-l', 1050.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '9140', 10160.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '127-4', 500.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '127', 450.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '5243', 10160.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '125', 470.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '8um', 950.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '8014', 10160.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '2173', 10160.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '4258', 580.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '8uy', 815.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '1404', 10160.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '9276', 950.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '2SS', 1100.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'gfm', 10160.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'D027U8', 500.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '9116-12', 250.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '127-1', 1100.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '15u', 10060.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '2168', 10060.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '8w6', 580.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '6E', 600.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '123', 580.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '79c', 600.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'dk1', 580.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'dk1-l', 1000.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '6001', 250.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '6900', 550.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '9906', 550.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '8011', 550.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '4001', 550.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '2402', 550.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '5004', 550.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '16d', 580.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '16m', 815.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '16h', 815.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'pk', 580.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'd49', 10160.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '79c-1', 1100.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '4408', 1100.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '603', 550.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '9255', 580.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'CH2SS', 1100.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'n127', 150.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ld27u8', 1350.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TB-S', 1200.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TB-N', 2000.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'n4258', 100.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '9116', 500.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '6004', 350.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'AQL9276', 750.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '9140-4', 350.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'tppkct', 600.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'KCN', 10160.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'KCT', 600.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'NKCT', 170.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'aql2ss', 2000.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TPP9276', 1000.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TPP127', 400.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '9295', 10060.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '9902', 480.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '7236', 1160.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '9024', 500.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TPP4408', 1100.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ND027U8', 100.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TPP9116', 500.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '4258-1', 1160.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ldgfm', 1300.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ld9140', 1300.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ld127', 1300.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ld027u8', 1300.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ld9116', 1000.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ld8014', 1300.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '5120', 500.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '2421', 600.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '2431', 1000.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '3311', 1000.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'D02N3C', 580.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'D02N3F', 580.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'tpp4258', 100.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '5140', 500.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '4305', 500.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'd02n23', 580.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TPPD02N23', 600.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ND02N23', 100.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'tb-sato', 800.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '2168-100', 1000.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '5770-r22', 200.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', '2801-r21', 235.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 'LD EJ', 1200.0, 0, 'mài đo', 11, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'DO' AS `process_code`, '127-2' AS `work_type`, 'LD DF' AS `product_code`, 950.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'mài đo' AS `source_sheet`, 11 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'DO', '127-2', 'tb5091', 960.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 's1657-3đ', 300.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 's1660-3đ', 300.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', '127-2', 's8052', 500.0, 0, 'mài đo', 11, 'active'
UNION ALL
SELECT 'DO', 'dòng 25', '598', 1080.0, 0, 'mài đo', 25, 'active'
UNION ALL
SELECT 'DO', 'dòng 27', '1090', 2801.0, 0, 'mài đo', 27, 'active'
UNION ALL
SELECT 'DO', 'dòng 27', '0', 320.0, 0, 'mài đo', 27, 'active'
UNION ALL
SELECT 'DO', 'dòng 29', '3880', 4563.0, 0, 'mài đo', 29, 'active'
UNION ALL
SELECT 'DO', 'dòng 29', '3065', 9414.0, 0, 'mài đo', 29, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '2252 ĐG', 3000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3031 ĐG', 1800.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3002 đg', 1800.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3202 ĐG', 200.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3035 ĐG', 3600.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '9665 đg', 32000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '8500 đg', 7500.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'h13 đg', 3000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'h17 đg', 3000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'lwl9 ĐG', 10000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'lwl12 ĐG', 10000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '2125 đg', 20000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '2209 đg', 20000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '245 đg', 600.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '174 ĐG', 15000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '173 ĐG', 15000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '175 ĐG', 15000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '247 đg', 1400.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 's1 đg', 12000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'S6 đg', 12000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 's7 đg', 1200.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 's17 đg', 2000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'yyu đg', 12000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '234 đg', 600.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '0696 đg', 8000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3202 đóng túi', 900.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3202 xỏ zick + lò xo', 1000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3202 đóng thùng', 1800.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3202 bôi bột', 1000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'grip trắng', 50.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '9436 đg', 15000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '2165 đg', 20000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'su520 đg', 1000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'su530 đg', 2000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '6396 đg', 16000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'su 8000', 200.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '161 đg', 15000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3749 đg', 800.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '0696 1', 1200.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '0696 2', 1200.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '6396 1', 1600.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '6396 2', 1600.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'g69 đg', 10000.0, 0, 'Định mức kiểm 1', 5, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2252 100', 300.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2252 200bktx', 242.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3031 100', 300.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3031 200', 300.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3035 100', 300.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3035 200', 300.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3035 200bktx', 242.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2911', 2000.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '262606', 2000.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3035 100bktx', 220.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2165-2', 1700.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2209-2', 1700.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'lwl9', 600.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'lwl12', 600.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2125', 1700.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2209', 1700.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '245', 200.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '174', 550.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '173', 550.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '175', 550.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '247', 250.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'S1', 250.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'S6', 1000.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 's7', 1000.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'S17', 250.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'S18', 300.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'S19', 600.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '234', 200.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '696', 800.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'key', 800.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'sealing', 2000.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'grip 50', 120.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'su530', 400.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'su520', 500.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'MR237', 500.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'MR05', 300.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'LWL9-CHBD', 5500.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2165', 600.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'top holder', 180.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '9436', 700.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'SILENCER', 500.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '6396', 1000.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '161', 400.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'yyu', 650.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'L918', 600.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'L919', 600.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '5203', 500.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3749', 300.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'lw-bd', 5000.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'lwl12-bd', 5000.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3035bk', 400.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3031bk', 400.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3002bk', 400.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '9665', 1000.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'g69', 600.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2606', 1700.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '173 2', 750.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '175 2', 750.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3031 100bktx', 220.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3002 100bktx', 220.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3002 200bktx', 242.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '174-vm', 950.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '173-vm', 950.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '175-vm', 950.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '174 3', 800.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '173 3', 800.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '175 3', 800.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'E503', 500.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'e409', 300.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'e393', 500.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '6035', 400.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '6036', 500.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'y225', 600.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2607', 1700.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'su8000', 500.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3031 200bktx', 242.0, 0, 'Định mức kiểm 1', 7, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 2165', 2000.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 2252', 300.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', '3002', 300.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 3031', 220.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'H 3035', 220.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 247', 200.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'đg0696-dm', 5000.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'đg247-dm', 500.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'MR05 đg', 500.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h h13', 900.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h h17', 1000.0, 0, 'Định mức kiểm 1', 9, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'K1' AS `process_code`, 'NGƯỜI MỚI NQ' AS `work_type`, 'h lwl9' AS `product_code`, 700.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'Định mức kiểm 1' AS `source_sheet`, 9 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h lwl12', 700.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 2125', 1700.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 2209', 1700.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 245', 200.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'H 174', 550.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 173', 550.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 175', 550.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h yyu', 500.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h s6', 1000.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h s7', 1000.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'hk yyu', 510.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'hk 3035', 187.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h s19', 800.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 234', 200.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 0696', 500.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'hk s6', 850.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'AQL 174', 500.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'J498', 250.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'grip 65', 120.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'LWL12-CHBD', 5500.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', '174-t', 840.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', '173-t', 840.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', '6396-pp', 700.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'hk 247', 175.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 6396 1', 1400.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 6396 2', 1400.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'e503 đg', 20000.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'e409 đg', 20000.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'e393 đg', 20000.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'l918 đg', 20000.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'check 3035', 1500.0, 0, 'Định mức kiểm 1', 9, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '3002 200bk', 253.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '3031 100bk', 230.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '3031 200bk', 250.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '3035 100bk', 230.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '3035 200bk', 250.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '2252 100bk', 230.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '2252 200bk', 253.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '3002 100bk', 230.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xlbv y3', 450.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '174-m', 1200.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '173-m', 1200.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'ch 9665', 1000.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '9665 1', 1600.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '9665 2', 1600.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xl 245', 200.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xl 174', 500.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xl 173', 500.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xl 175', 500.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xl 247', 300.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'lwl9 mới', 200.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'Grip Br', 85.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xl 234', 200.0, 0, 'Định mức kiểm 1', 11, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', 'bong lw', 230.0, 0, 'Định mức kiểm 1', 13, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', '2209 1', 600.0, 0, 'Định mức kiểm 1', 13, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', '2209 2', 600.0, 0, 'Định mức kiểm 1', 13, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', '2209 3', 600.0, 0, 'Định mức kiểm 1', 13, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', '2209 4', 600.0, 0, 'Định mức kiểm 1', 13, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', '8500', 500.0, 0, 'Định mức kiểm 1', 13, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', 'LWL12-M', 480.0, 0, 'Định mức kiểm 1', 13, 'active'
UNION ALL
SELECT 'K1', 'CẮT', 'ch 173bv', 700.0, 0, 'Định mức kiểm 1', 15, 'active'
UNION ALL
SELECT 'K1', 'CẮT', 'ch 174bv', 700.0, 0, 'Định mức kiểm 1', 15, 'active'
UNION ALL
SELECT 'K1', 'CẮT', 'ch 175bv', 700.0, 0, 'Định mức kiểm 1', 15, 'active'
UNION ALL
SELECT 'K1', 'LĂN DƯỠNG', '174 pp', 450.0, 0, 'Định mức kiểm 1', 17, 'active'
UNION ALL
SELECT 'K1', 'LĂN DƯỠNG', '0696 1pp', 800.0, 0, 'Định mức kiểm 1', 17, 'active'
UNION ALL
SELECT 'K1', 'LĂN DƯỠNG', '0696 2pp', 800.0, 0, 'Định mức kiểm 1', 17, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'lồng zick lòng trong', 1500.0, 0, 'Định mức kiểm 1', 21, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 234', 1200.0, 0, 'Định mức kiểm 1', 21, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 3035', 3000.0, 0, 'Định mức kiểm 1', 21, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 3031', 1500.0, 0, 'Định mức kiểm 1', 21, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 247', 2000.0, 0, 'Định mức kiểm 1', 21, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 2252', 1500.0, 0, 'Định mức kiểm 1', 21, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 245', 1200.0, 0, 'Định mức kiểm 1', 21, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 3002', 1500.0, 0, 'Định mức kiểm 1', 21, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'check jig 3031', 500.0, 0, 'Định mức kiểm 1', 21, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'lắc jig 3031', 500.0, 0, 'Định mức kiểm 1', 21, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 2252', 253.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check 175', 1500.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 3031', 253.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 3035', 253.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '234 tx', 200.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 3202', 2000.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '2252 100bktx', 220.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 252911', 2500.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 262606', 2500.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3202 máy', 230.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check 174', 1500.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check 173', 1500.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch lwl9', 800.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch lwl12', 800.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 2125', 660.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 2209', 1700.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 245', 220.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 174', 572.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 173', 572.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 175', 572.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 247', 280.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch s1', 275.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch s6', 1000.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch s7', 1100.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch s17', 275.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch s18', 330.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch s19', 660.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 234', 220.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 0696', 880.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch key', 880.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch sealing', 2200.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch grip', 132.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch su530', 440.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch su520', 550.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch MR237', 550.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 0063', 330.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '9436 đg', 15000.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 2165', 660.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check kt', 1500.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch top', 198.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 9436', 1100.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 's19 đg', 12000.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 161', 440.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 6396', 1100.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3035 3', 253.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3202 3', 450.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3031 3', 500.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '2252 3', 500.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3202 gói', 500.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3035 300bk', 220.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3031 300bk', 220.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '2252 300bk', 220.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'CH G69', 660.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check yyu', 660.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check 8500', 1500.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 8500', 1000.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check 3202', 250.0, 0, 'Định mức kiểm 1', 23, 'active'
UNION ALL
SELECT 'K1', 'CHECK SÉT', 'check s6', 1000.0, 0, 'Định mức kiểm 1', 25, 'active'
UNION ALL
SELECT 'K1', 'CHECK SÉT', 'CH 174VIA', 1000.0, 0, 'Định mức kiểm 1', 25, 'active'
UNION ALL
SELECT 'K1', 'CHECK SÉT', 'ch174', 1500.0, 0, 'Định mức kiểm 1', 25, 'active'
UNION ALL
SELECT 'K1', 'CHECK HÀNG NGƯỜI MỚI', 'lwl9 l1', 200.0, 0, 'Định mức kiểm 1', 27, 'active'
UNION ALL
SELECT 'K1', 'CHECK HÀNG NGƯỜI MỚI', 'lwl9 l2', 270.0, 0, 'Định mức kiểm 1', 27, 'active'
UNION ALL
SELECT 'K1', 'CHECK HÀNG NGƯỜI MỚI', '247 tx', 250.0, 0, 'Định mức kiểm 1', 27, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'K1' AS `process_code`, 'CHECK HÀNG NGƯỜI MỚI' AS `work_type`, 'lwl12 l1' AS `product_code`, 200.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'Định mức kiểm 1' AS `source_sheet`, 27 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'K1', 'CHECK HÀNG NGƯỜI MỚI', 'lwl12 l2', 270.0, 0, 'Định mức kiểm 1', 27, 'active'
UNION ALL
SELECT 'K1', 'CHECK HÀNG NGƯỜI MỚI', 'lwl12 l3', 100.0, 0, 'Định mức kiểm 1', 27, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'Dán thùng', 55.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg5770', 1188.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg5770-dt', 1400.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg2801', 1118.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg2801-dt', 1320.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg7133', 1118.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg7133-dt', 1320.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg7960', 1188.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg9149', 1848.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg9149-dt', 2180.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg3880', 1333.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg3880-dt', 1570.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg5091', 400.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg5092', 350.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg7630', 528.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg7630-dt', 623.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg9565', 990.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg9565-dt', 1168.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6773', 704.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6773-dt', 730.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1657', 132.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1657-dt', 156.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1660', 165.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1660-dt', 195.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg8484', 4620.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg8484-dt', 5450.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg8485', 4620.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg8485-dt', 5450.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1080', 2310.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1080-dt', 2725.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1090', 3080.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1090-dt', 3630.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐG0575', 726.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐG0575-dt', 860.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐG8052', 100.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐG8052-dt', 120.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6485', 9750.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6486', 64800.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6487', 13000.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6488', 13000.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6489', 13000.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6490', 13000.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6491', 64800.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6492', 57600.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6493', 72000.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6494', 72000.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6495', 57600.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐGD02N3C-R', 4000.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐGD02N3F-R', 4000.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg7236', 2400.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg49', 2400.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg5120', 1552.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ks0603', 500.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS4001', 500.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS5004', 500.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS8011', 500.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS2402', 500.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS9906', 500.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS6900', 500.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS6001', 500.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg2ss', 1400.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'tb-s', 1200.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'v2ss', 2000.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', '15U-LB', 1800.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'TB-N', 2000.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', '127-l', 1050.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐG9902', 1600.0, 0, 'Kiểm 2', 5, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9740', 392.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5770', 392.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6270', 380.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '2801', 380.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6262', 380.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '7133', 380.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '598', 380.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '7960', 335.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9149', 335.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '4563', 335.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '3880', 335.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5861', 335.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '3438', 430.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5091', 190.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5092', 120.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '7630', 150.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9565', 250.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6773', 150.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '1657', 48.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '1660', 48.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8052', 60.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8484', 490.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8485', 500.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '1080', 450.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '1090', 460.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8234', 490.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8235', 500.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '575', 330.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6485', 500.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6486', 1000.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6487', 520.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6488', 520.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6489', 520.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6490', 520.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6492', 1000.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6493', 1100.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6494', 1100.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6495', 1100.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9968', 392.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9477', 392.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '977', 330.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'đg6330', 1188.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'đg6328', 1188.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'đg6242', 1188.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'đg6240', 1188.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6396', 1000.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '696', 800.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9665', 1000.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'YYU', 650.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D02N3C-R', 1500.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D02N3F-R', 1500.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '4305', 300.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D02N23', 625.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D02N3C', 445.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D02N3F', 445.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9024', 300.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5243', 720.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '123', 445.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '125', 400.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '7236-R', 1000.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '7236', 828.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '2168', 1100.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '2173', 840.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '79C', 420.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'DK1', 445.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '4258', 625.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8014', 750.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '127', 450.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9116', 450.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9140', 450.0, 0, 'Kiểm 2', 7, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'K2' AS `process_code`, 'KIỂM' AS `work_type`, '9276' AS `product_code`, 630.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'Kiểm 2' AS `source_sheet`, 7 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'K2', 'KIỂM', '396', 630.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D49', 1100.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '15U', 600.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8W6', 445.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'GFM', 750.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '4001', 300.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5004', 315.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8011', 300.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '2402', 315.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9906', 300.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6900', 300.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6001', 300.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '2SS', 630.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6E', 515.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '16H', 500.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8UY', 500.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'PK', 445.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '16D', 445.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '16M', 400.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8UM', 400.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '603', 300.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6004', 315.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'kcn', 840.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'KCT', 625.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D02PD8', 630.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '1432', 1200.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5120', 300.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '1404', 720.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '4408', 720.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9295', 600.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9902', 315.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D027U8', 450.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '42421', 515.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '42431', 500.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '43311', 600.0, 0, 'Kiểm 2', 7, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9740', 392.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h5770', 392.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6270', 380.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h2801', 380.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6262', 380.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h7133', 380.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h0598', 380.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h7960', 335.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9149', 335.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h4563', 335.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h3880', 335.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h5861', 335.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h3438', 430.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h7630', 150.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9565', 250.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6773', 150.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h1657', 48.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h1660', 48.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h8484', 490.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h8485', 500.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h1080', 450.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h1090', 460.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h8234', 490.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h8235', 500.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H0575', 330.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6485', 500.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6486', 1000.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6487', 500.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6488', 500.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6489', 500.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6490', 500.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6492', 1050.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6493', 1050.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6494', 1050.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6495', 1050.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9968', 392.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9477', 392.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6396', 1000.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h0696', 800.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9665', 1000.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'c0977', 363.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h5243', 504.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h123', 311.5, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h125', 280.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h7236', 579.6, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h2168', 1160.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h2173', 588.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h79c', 294.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'hdk1', 311.5, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h4258', 437.5, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h127', 315.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9116', 315.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9140', 315.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9276', 441.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h396', 441.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'hd49', 770.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h15u', 420.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h8w6', 311.5, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'hgfm', 525.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h4001', 210.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h5004', 220.5, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h8011', 210.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h2402', 220.5, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9906', 210.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6900', 210.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6001', 210.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H2SS', 441.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H6E', 360.5, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H16H', 350.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H8UY', 350.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'HPK', 311.5, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H16D', 311.5, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H16M', 280.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H8UM', 280.0, 0, 'Kiểm 2', 9, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9740', 431.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c5770', 431.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6270', 418.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c2801', 418.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6262', 418.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c7133', 418.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c0598', 418.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c7960', 369.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9149', 369.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c4563', 369.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c3880', 369.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c5861', 369.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c3438', 473.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c7630', 165.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9565', 275.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6773', 165.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c1657', 53.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c1660', 53.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8484', 539.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8485', 550.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c1080', 495.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c1090', 506.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8234', 539.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8235', 550.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6485', 650.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6486', 1300.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6487', 650.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6488', 650.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6489', 650.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6490', 650.0, 0, 'Kiểm 2', 11, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'K2' AS `process_code`, 'Check hàng người mới' AS `work_type`, 'c6492' AS `product_code`, 1400.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'Kiểm 2' AS `source_sheet`, 11 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6493', 1400.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6494', 1400.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6495', 1400.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9477', 430.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6396', 1100.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c0696', 880.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9665', 1100.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9968', 430.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c5243', 1146.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c123', 708.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c125', 636.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c7236', 1242.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c2168', 1719.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c2173', 1336.5, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c79c', 669.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'cdk1', 708.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c4258', 994.5, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8014', 1194.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c127', 715.5, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9116', 715.5, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9140', 572.4, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9276', 1002.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c396', 1002.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c49', 1750.5, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c15u', 955.5, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8w6', 708.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'cgfm', 1194.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c4001', 300.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c5004', 315.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8011', 300.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c2402', 315.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9906', 300.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6900', 300.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6001', 300.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c2ss', 1002.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6e', 819.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c16h', 795.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8uy', 795.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'cpk', 708.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c16d', 708.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c16m', 636.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8um', 636.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c603', 300.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'CKCN', 1260.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'CKCT', 937.5, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'CD02PD8', 937.5, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'C1432', 1800.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'C9295', 900.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'chek mốc 907001', 300.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', '9070', 280.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'CKCT200', 300.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'CYYU', 700.0, 0, 'Kiểm 2', 11, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6486', 2350.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6487', 1400.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6488', 1400.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6490', 1400.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6492', 2500.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6493', 2500.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6494', 2500.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6495', 2350.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6485 TM', 3000.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6486 TM', 4500.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6487 TM', 3000.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6488 TM', 3000.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6489 TM', 3000.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6490 TM', 3000.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6492 TM', 4500.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6493 TM', 4500.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6494 TM', 4500.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6495 TM', 4500.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'chgyx', 12000.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6485', 650.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6486', 1300.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6487', 676.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6488', 676.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6489', 676.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6490', 676.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6492', 1430.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6493', 1430.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6494', 1430.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6495', 1430.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'chv-2ss', 1800.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'chv-9276', 1800.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'mc4563', 780.0, 0, 'Kiểm 2', 13, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6485', 2000.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6486', 2300.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6487', 2000.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6488', 2000.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6489', 2000.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6490', 2000.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6492', 2300.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6493', 2300.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6494', 2300.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6495', 2300.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'F0575', 1200.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'ĐH0575', 1100.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'F0977', 1200.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'ĐH0977', 1100.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'ld ej', 1200.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'ld df', 800.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'F6494', 1500.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6495', 1500.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6486', 1500.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6488', 1400.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6489', 1200.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6487', 1400.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6490', 1400.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'F6493', 1500.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'F6492', 1500.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'mc6486', 2350.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'mc6494', 2350.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'mc6495', 2350.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f-r0977', 1200.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f-r0575', 1200.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6485', 1200.0, 0, 'Kiểm 2', 15, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6487-LCS', 2340.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6488-LCS', 2340.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6490-LCS', 2340.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6489-LCS', 2340.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH9740', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH5770', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH6270', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH2801', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH6262', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH7133', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH0598', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH4563', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH3880', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH9149', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'cgyx', 8000.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6486-lcs', 2340.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH1080', 585.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6485-200%', 650.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6486-200%', 1300.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6487-200%', 520.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6488-200%', 520.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6489-200%', 520.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6490-200%', 520.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6492-200%', 1300.0, 0, 'Kiểm 2', 17, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'K2' AS `process_code`, 'CHECK HÀNG' AS `work_type`, '6493-200%' AS `product_code`, 1430.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'Kiểm 2' AS `source_sheet`, 17 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6494-200%', 1430.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6495-200%', 1430.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6485-lcs', 2340.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9477', 509.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ĐG0977', 726.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ĐG0977-dt', 860.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9968', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch6396', 3000.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch0696', 2400.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9665', 3000.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch5243', 1528.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch123', 944.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch125', 848.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '7236-ĐG', 2000.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch7236', 1738.8, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch2168', 2292.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch2173', 1782.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch79C', 892.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chDK1', 944.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch4258', 1326.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch8014', 1592.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch127', 954.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9116', 954.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9140', 900.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9276', 1449.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch396', 1336.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chD49', 2530.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch15U', 1274.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch8W6', 979.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chGFM', 944.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch4001', 1592.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch5004', 630.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch8011', 890.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch2402', 800.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9906', 800.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch6900', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch6001', 1200.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch2SS', 1336.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch6E', 1255.8, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch16H', 1060.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch8UY', 1060.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chPK', 944.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch16D', 944.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch16M', 848.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch8UM', 848.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch603', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'LB15U', 1274.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CHKCN', 1875.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CHKCT', 1250.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH1432', 2400.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9902', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CHD02PD8', 1536.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH9295', 1274.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chd027u8', 954.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH5120', 600.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chset8uy', 800.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chset8W6', 800.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'check khay bẩn 15u', 1400.0, 0, 'Kiểm 2', 17, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck5770', 2400.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK2801', 2400.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK6262', 2400.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck0598', 2400.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck ej', 2400.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck1090', 2200.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck8234', 2200.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck8235', 2200.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK8485', 2200.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK1080', 2200.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK8484', 2200.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK5243', 2336.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck123', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK7236', 2336.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck2168', 2336.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck2173', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck79c', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck8014', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck127', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck9116', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck9140', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck9276', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CD49', 800.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck8w6', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ckgfm', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck9906', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck6900', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck2ss', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck16h', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck8uy', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ckpk', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck16d', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'VT2SS', 2000.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck8um', 1512.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ĐG1432', 60000.0, 0, 'Kiểm 2', 19, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6486', 4350.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6487', 1920.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6488', 1920.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6489', 1920.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6490', 1920.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6492', 3720.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6493', 4500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6494', 4500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6495', 3720.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6486', 13500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6487', 2700.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6488', 2700.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6489', 2700.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6490', 2700.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6492', 9600.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6493', 9600.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6494', 9600.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6495', 9600.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb0575', 600.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6485', 2700.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb-df', 1500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6485-200%', 650.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6486-200%', 1300.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6487-200%', 650.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6488-200%', 650.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6489-200%', 650.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6490-200%', 650.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6492-200%', 1400.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6493-200%', 1400.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6494-200%', 1400.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6495-200%', 1400.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'ld0977', 850.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'ch-tắc vòi', 1300.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'ch174', 1500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs4001', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs5004', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs8011', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs2402', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs9906', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs6900', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs6001', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs6003', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'HS6004', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'chHV-2SS', 2500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'lđk1', 800.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'chHV-9276', 2500.0, 0, 'Kiểm 2', 21, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

INSERT INTO product_standard_variants
(process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, source_sheet, source_row, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), s.source_sheet, s.source_row, 'active'
FROM (
SELECT 'K2' AS `process_code`, 'Lăn Khoảng sáng' AS `work_type`, 'LD127' AS `product_code`, 1300.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'Kiểm 2' AS `source_sheet`, 21 AS `source_row`, 'active' AS `status`
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'ld16m', 800.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'LDGFM', 1300.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'LD9140', 1300.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'LD8014', 1300.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'T-KCT', 400.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs9902', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'LDD027U8', 1350.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs5120', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'HS9024', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'XB9902', 450.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'HS4305', 500.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'XLBVT0603', 60.0, 0, 'Kiểm 2', 21, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL9740', 392.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL5770', 392.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6270', 380.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL2801', 380.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6262', 380.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL7133', 380.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL0598', 380.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL7960', 335.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL9149', 335.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL4563', 335.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL3880', 335.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL5861', 335.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL3438', 430.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL5091', 190.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL5092', 120.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL7630', 150.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL9565', 250.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6773', 150.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL1657', 48.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL1660', 48.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL8052', 60.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL8484', 490.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL8485', 500.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL1080', 450.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL1090', 460.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL8234', 490.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL8235', 500.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL0575', 330.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6485', 520.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6486', 1000.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6487', 520.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6488', 520.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6489', 520.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6490', 520.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6492', 1000.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6493', 1100.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6494', 1100.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6495', 1100.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL9477', 392.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'tt-6494', 2365.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'tt-6495', 1935.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'tt-6488', 855.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'tt-6487', 855.0, 0, 'Kiểm 2', 23, 'active'
UNION ALL
SELECT 'K2', 'dòng 25', 'CTT-2173', 2720.0, 0, 'Kiểm 2', 25, 'active'
UNION ALL
SELECT 'K2', 'dòng 25', 'CTT-2168', 5040.0, 0, 'Kiểm 2', 25, 'active'
UNION ALL
SELECT 'K2', 'dòng 25', 'CTT-127', 5040.0, 0, 'Kiểm 2', 25, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), source_sheet=VALUES(source_sheet), source_row=VALUES(source_row), status='active' ;

-- ============================================================================
-- 5. ĐỊNH MỨC ĐANG DÙNG TRONG ỨNG DỤNG
-- ============================================================================
INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'EP' AS `process_code`, 'ÉP' AS `work_type`, 'D006P-2' AS `product_code`, 617.1 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'EP', 'ÉP', '15U-2', 560.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'LWL9-2', 370.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '7236', 1066.39, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'Y225', 201.6, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'GRIP50', 10.2, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6035', 57.6, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '2125', 1920.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'E393', 748.8, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '245', 130.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '2SV-2', 629.2, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '247-2', 151.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '5091', 480.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '5092', 480.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6489', 309.76, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6396', 716.8, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '3035-1', 249.6, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '3035-2', 289.92, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'YYU-2', 1037.66, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'KEY RUBBE', 7.272727, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'LWL12', 370.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'N23', 806.4, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'GRIP65', 11.82, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'E503', 218.4, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '9902', 75.2, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '15U-3', 560.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '8016', 724.2, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '9436-2', 767.52, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '5140', 96.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'TBN-47', 600.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '3880', 1985.5, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6773', 1014.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '7630', 673.1, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '1657', 490.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '0575', 460.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '1080-2', 744.48, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '1090', 1236.48, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6900', 57.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '125', 510.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '5120', 144.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '4305', 56.4, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'J84', 720.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'UY-2', 1048.5, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '2252', 261.12, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '3031', 279.18, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'J498', 735.84, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '262606', 2000.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '262607', 2544.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '252911', 2544.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '2209', 1725.44, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '2165', 1664.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '9436-3', 767.52, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'SU530', 110.4, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '8234', 1244.25, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '8235', 1165.5, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '234', 136.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'S1', 72.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'S6', 979.2, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'S7', 688.8, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'S17', 84.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '27UA', 1260.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'S19', 672.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6492', 1387.2, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6003', 54.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '9665', 628.8, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'E-2556', 285.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '9118-4', 1014.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', '6491', 1387.2, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'E-7236', 900.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'E409', 140.0, 0, 'active'
UNION ALL
SELECT 'EP', 'ÉP', 'E-KCT', 210.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '57.599999999999994', 6328.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '1920', 9906.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '748.80000000000007', 40001.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '130', 2402.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '629.20000000000005', 603.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '309.76', 68.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '249.60000000000002', 6270.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '560', 8484.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '767.52', 9024.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '96', 6495.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '600', 6494.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '1985.5', 6485.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '1014', 6488.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '673.1', 6487.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '490.00000000000006', 3002.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '459.99999999999994', 161.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '744.48', 911.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '57', 8052.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '509.99999999999994', 1432.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '261.12', 9295.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '2000', 6044.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '2544', 1404.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '1725.44', 6493.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '1664', 4408.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '110.39999999999999', 6004.0, 0, 'active'
UNION ALL
SELECT 'EP', '617.09999999999991', '979.19999999999993', 559.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'L918', 443.2, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '0696-1', 734.4, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '0696-2', 734.4, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '0696-3', 734.4, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SU8000', 22.02, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SU520', 28.8, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6328', 500.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '9906', 72.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '40001', 72.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '2402', 47.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '603', 57.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'L919', 498.6, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET-G', 540.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'TOPHOLDER', 100.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '68', 6.363636, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET175-H', 540.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6270', 1418.24, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET-D', 540.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET-H', 540.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET-E', 540.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET-C', 534.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET175-E', 540.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET175-C', 534.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6490-1', 396.9, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'MR05', 31.8, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '8484', 861.9, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '9142-3', 1064.7, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6486', 1228.8, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6495', 1387.2, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6494', 1387.2, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6485', 172.8, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6488', 309.12, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6487', 300.8, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '3002', 190.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '161', 460.8, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '911', 2800.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6490-2', 396.9, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '8052', 1037.66, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '1432', 1032.59, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'GYX', 1308.16, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'UM-2', 1039.5, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'YYU-3', 1060.982, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '7236-4', 1066.39, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '9295', 900.77, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '129-3', 1064.7, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SOCKET175-D', 540.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6044', 1418.24, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '8500', 591.5, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '1404', 738.1, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6493', 1384.31, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '4408', 705.43, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '9024', 57.6, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '6004', 75.2, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'S18', 89.6, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'KCN', 1152.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'SATO', 22.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '9436-4', 767.52, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', '559', 43.65, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'P-1080', 80.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-1080', 200.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-9142', 210.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-3880', 285.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-9276', 1360.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'EP' AS `process_code`, 'L918' AS `work_type`, 'E-2SS' AS `product_code`, 400.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'EP', 'L918', 'E-15U', 600.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-9116', 150.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-1657', 150.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-8UY', 300.0, 0, 'active'
UNION ALL
SELECT 'EP', 'L918', 'E-8UM', 300.0, 0, 'active'
UNION ALL
SELECT 'EP', '443.2', '396.90000000000003', 2402.0, 0, 'active'
UNION ALL
SELECT 'EP', '443.2', '540', 161.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9431', 68.5, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9628', 80.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9630', 80.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9437', 53.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9435', 48.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9629', 53.5, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'KRE40LGB', 43.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9669', 68.5, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'ST0003', 40.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'N2710', 66.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'E2500', 66.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'SI0464', 90.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'SI0465', 91.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'SI0587', 91.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'CÂN EP9431', 60.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'RBB-2881-30', 10.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EP9450', 52.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'SI0463', 90.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'E2710', 41.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'SI9438', 90.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'TPW98', 48.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'TPW130', 48.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'TPW225', 48.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'CAT YYU#3', 35.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'TEW122', 53.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'CAT L918', 1.25, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'CAT S6', 7.5, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'CAT L919', 1.25, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'SI0001', 45.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'CÁN', 'EPDM50', 53.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'EP0010', 68.5, 0, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'TE-1322', 58.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'CAT 174', 41.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'SILICONE', 20.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'IT0006', 70.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'S6', 20.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'S7', 20.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'S1', 20.0, 0, 'active'
UNION ALL
SELECT 'CAN', 'C-EP9431', 'CAT 175', 41.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', 'lwl9 sơn', 250.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', 'lwl12 sơn', 230.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '2606 L2', 12000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '2606 L1', 12000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '6003 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9900 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9024 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9500 SƠN', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '5140 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9300 SƠN', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '80000 SƠN', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '5150 SƠN', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '6100 SƠN', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '8200 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9023 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '6900 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9906 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '4408 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '40001 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '6004 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '2402 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '0603 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '6000 SƠN', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '5120 SƠN', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '4100 SƠN', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '5800 SƠN', 140.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '245', 220.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '5600 SƠN', 140.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '9902 SƠN', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '4001 SƠN', 80.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '3901 SƠN', 150.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'SƠN', '6036', 300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'LWL9', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'LWL12', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '2125', 15000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '2165', 4250.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6003', 85.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9900', 85.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 's19', 350.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9024', 80.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 's9', 100.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'GRIP 50', 50.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'mr05', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '3749', 150.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '911', 8500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '15u', 500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'g69', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6485', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6491', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '1404', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '5243', 620.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6E', 450.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'E503', 90.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'E393', 300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'E409', 300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '3002', 500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '0696', 930.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '3031', 500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9665', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'su520', 500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'YYU', 850.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '559', 300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'L919', 320.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 's17', 250.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'SU530', 250.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9023', 80.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6900', 85.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '8500', 330.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9436', 450.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '7236#3', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6493', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 's6', 1500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9906', 75.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'L918', 280.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9295', 1400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 's1', 40.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6492', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '4408', 500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'J498', 900.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 's7', 450.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '40001', 75.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '247', 250.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '2252', 520.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '3035', 520.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6004', 85.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '2402', 85.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6494', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6486', 300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6487', 300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'UY', 350.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '2SV', 450.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6495', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '2209', 8500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '161', 170.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6489', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6396', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '174', 300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '175', 290.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6490', 260.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6488', 250.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '0603', 80.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '5092', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '5120', 90.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6270', 2500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'S18', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '52675', 100.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', 'SU8000', 100.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '9902', 85.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '3880', 2500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '5140', 90.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '4305', 85.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '4305 sơn', 160.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '4001', 80.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'XLBV' AS `process_code`, 'XLBV' AS `work_type`, '3901' AS `product_code`, 80.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'XLBV', 'XLBV', 'TOP HOLDER', 100.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV', '6035', 100.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '2125 L2', 14000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', 'Y225', 350.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '9500', 60.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6044', 2000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '9300', 80.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '80000', 60.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', 'D02DFV', 80.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', 'GRIP SI', 50.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', 'MR237', 300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6100', 60.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '1090', 2000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '5150', 90.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6491 VN', 650.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '5243 NGOÀI', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '8200', 80.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '1400', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '0696 TÁCH', 1500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '3031 VN', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6493 VN', 650.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6492 VN', 650.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '2252 VN', 900.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '3035 VN', 900.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6494 VN', 650.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6486 VN', 700.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6487 VN', 500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '2SV VN', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6495 VN', 650.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '2209 L2', 10000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6489 VN', 500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6396 VN', 700.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '174 VN', 800.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '175 VN', 700.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6490 VN', 450.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6488 VN', 450.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '6000', 80.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '4100', 80.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '5800', 80.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '234', 220.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'VIA NGOÀI', '5600', 80.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'S19VIA', 135.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', '174-B1', 120.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'GRIP', 30.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'CẠO TRỤC TÁI', 25.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'GRIP-CAM', 15.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'E503 VIA', 50.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'E393 VIA', 150.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'E409 VIA', 150.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', '0696 VIA', 450.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'YYU VIA', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'SOCKET CHECK', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', '7236-4', 1200.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'S6 VIA', 250.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'L918 VIA', 200.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'S1 VIA', 20.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'J498 VIA', 300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', '6396 VIA', 300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', '6490 VIA', 180.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'GIA LƯU', 1.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'XLBV CÓ VIA KHÓ', 'TBN-47', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG DO KHUÔN', '0696-1', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG DO KHUÔN', '7236-2', 2000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG DO KHUÔN', '174-e', 330.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG DO KHUÔN', 'CÔNG ĐOẠN', 1.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'BẮN CÁT', '3031 check', 700.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'BẮN CÁT', '174 VÒI', 800.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'BẮN CÁT', '175 VÒI', 800.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6485 CHECK', 900.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6491 CHECK', 3000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '3002 LAU', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6493 CHECK', 3000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6492 check', 3000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '247 CHECK', 350.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '2252 CHECK', 1540.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '3035 CHECK', 1540.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6494 CHECK', 3000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6486 CHECK', 3000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6487 CHECK', 900.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6495 CHECK', 3000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6489 CHECK', 900.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6490 CHECK', 900.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '6488 CHECK', 900.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '1080 CHECK', 3000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'CHECK HÀNG', '8016 check', 2000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'DẬP', '3002 KHOAN', 140.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'DẬP', '3031 DẬP MÁY', 400.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'DẬP', '2252 DẬP MÁY', 300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'DẬP', '174 DẬP', 530.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'DẬP', '175 DẬP', 530.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LỖ KHÍ', 'lwl9 lk', 800.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LỖ KHÍ', 'lwl12 lk', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LỖ KHÍ', '3031 LK', 820.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', 'BÓC PHÔI TÁI', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', 'bắn phôi', 3000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', 'bắn trục', 300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6491 LT MÁY', 1500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '3031 L-JIC', 1300.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6493 LT MÁY', 1500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6492 LT MÁY', 1500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6494 LT MÁY', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6486 LT MÁY', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6495 LT MÁY', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'TRÊN MÁY', '6396 VN MÁY', 2000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6491 LT', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '3002 LT', 380.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '3031 LT', 590.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6493 LT', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6492 LT', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '2252 LT', 930.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '3035 LT', 930.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6494 LT', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6486 LT', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6487 LT', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '2SV LT', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6495 LT', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '2209 L1', 15000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6489 LT', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6490 LT', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'LÒNG TRONG', '6488 LT', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6485 ngoài', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6491 ngoài', 700.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '3031 KHOAN', 140.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', 'yyu ngoài', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '9436 ngoài', 500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '7236 ngoài', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6493 ngoài', 700.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', 'S6 NGOÀI', 1500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', 'N23', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '9295 ngoài', 700.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', 's1 ngoài', 100.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6492 ngoài', 700.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '4408 NGOÀI', 1000.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', 's7 ngoài', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6494 ngoài', 700.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6486 ngoài', 650.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6487 ngoài', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', 'uy ngoài', 500.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '2sv ngoài', 700.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6495 ngoài', 700.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6489 ngoài', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '174 ngoài', 380.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '175 ngoài', 380.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6490 ngoài', 600.0, 0, 'active'
UNION ALL
SELECT 'XLBV', 'HÀNG BÊN NGOÀI', '6488 ngoài', 600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2556-2', 7200.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2556-11', 6600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2556-8', 5600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2556-9', 5000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C2556-auto', 5000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2821', 2400.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2822', 2400.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8484', 2400.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8485', 2400.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3880-2', 7200.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c0977', 1460.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3880-8', 5600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3880-9', 5000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c9149', 6000.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'GC' AS `process_code`, 'Cắt' AS `work_type`, 'c0575' AS `product_code`, 1460.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'GC', 'Cắt', 'c3438', 2600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c1080', 1800.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c1090', 2000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c1657', 2600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c5770-9', 6400.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c7630', 5000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c5770', 8000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8052', 5800.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C5770-1', 4800.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8234', 2400.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8235', 2400.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6773', 4000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', '5243-l', 182.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'cpk-r', 2415.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c125', 2106.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c7236', 900.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2453', 2130.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c79c', 2415.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c79c-3', 3066.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'cdk1', 2415.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c4268', 2415.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8016', 4088.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c129', 3105.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c9118', 2800.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c9142', 4088.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c7236-2', 500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c1432', 800.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c4268-3', 2715.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C129-13', 2415.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8um', 2415.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c9118-13', 2415.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8um-3', 2415.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'ckcn', 2250.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'cd027u8', 1440.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C8016-12', 3220.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8um-t', 1610.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8uy', 850.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2401', 1440.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c2411', 850.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3301', 850.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'CD02N23', 900.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'CD02N3C', 2415.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'CD02N3F', 2415.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c9520', 7200.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c8052-auto', 4500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6491', 1525.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'Cgyx-auto', 6000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C7630-11', 6600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3880-auto', 4500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C5770-auto', 6660.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c3880-11', 6600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'Cj84', 2400.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C6494-t', 812.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C502', 1560.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c9149-1', 4480.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C6485', 1525.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6486', 1625.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6487', 1525.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6488', 1525.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6489', 1525.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6490', 1525.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6492', 1625.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6493', 1625.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6494', 1625.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'c6495', 1625.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'CGYX-9', 6080.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'CGYX', 7500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'cgyx-1', 4480.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Cắt', 'C8052-1', 3600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9740', 420.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2801', 605.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6262', 420.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '598', 420.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '7133', 605.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8484', 540.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8485', 570.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '4563', 605.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '3880', 400.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '7960', 300.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9149', 360.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '575', 300.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '3438', 420.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '1080', 660.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '1090', 660.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '1657', 90.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '1660', 90.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '7630', 180.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '5770-T', 420.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '5861', 605.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9565', 200.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8234', 660.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8235', 660.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6773', 120.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8052', 36.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '4408-T', 162.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '4408-L', 162.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '5243', 615.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '123', 320.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '125', 280.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '7236', 690.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2168', 600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2173', 600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'D02N3C', 335.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'D02N3F', 335.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '4258', 335.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8014', 550.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '127', 500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9116', 300.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9140', 500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9276', 500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'd0049', 430.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8w6', 335.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'gfm', 510.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'd49', 355.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '15u-l', 180.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8011', 200.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '1432-kt', 600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '15u-t', 180.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'd02n23', 120.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6001', 160.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2ss', 400.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9140-3', 350.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6e', 160.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '16h', 250.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8uy', 250.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'pk', 335.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '16d', 335.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '16m', 335.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6e-c1', 210.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6e-c2', 210.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6e/2', 160.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '127-t', 160.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8um', 350.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '16m-1', 350.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '8w6-1', 335.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2495', 350.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9140-1', 180.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'gfm-3', 400.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'kct', 335.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'kcn', 550.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '4408', 500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '15U', 600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9295-T', 180.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9295-L', 180.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9295', 550.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'D027U8', 120.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'LDD027U8', 1350.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '3301-L', 180.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '3301-T', 180.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '3311', 600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LTX', 840.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'DF', 660.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LD7630', 300.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LD6773', 300.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'Sàng 2556', 54000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'Sàng 3880', 60000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'đg cs', 80000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'đh0575', 1100.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'f0575', 1200.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'GC' AS `process_code`, 'LTX' AS `work_type`, '977' AS `product_code`, 300.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'GC', 'LTX', 'ld0977', 300.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld9149', 480.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld0575', 300.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LD123', 800.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld8w6', 1000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LD16M', 800.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld9565', 200.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', '5243-t', 182.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld8014', 1300.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld127', 1300.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld9140', 1300.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld15u', 1200.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ldgfm', 1300.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LDDK1', 500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'LD9116', 800.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld16h', 1000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld8uy', 1000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'ld8um', 800.0, 0, 'active'
UNION ALL
SELECT 'GC', 'LTX', 'NẮN S', 350.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6486', 4350.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6487', 1920.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6488', 1920.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6489', 1700.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6490', 1920.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6491', 1920.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6492', 3720.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6493', 4500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6494', 4500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6495', 3720.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 't-6485', 1700.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6486', 13500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6487', 2700.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6488', 2700.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6489', 2700.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6490', 2700.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6492', 9600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6493', 9600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6494', 9600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'tb6495', 9600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'c9503', 1680.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'c1467', 1800.0, 0, 'active'
UNION ALL
SELECT 'GC', 'đgcsu', 'f6495', 1500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9477', 605.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '5770', 605.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6270', 605.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '5091', 600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '9968', 605.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '5092', 36.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'đo 5092', 216.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'ch gyx', 20000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '1404', 350.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'c1404', 600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6495-l', 1000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6494-l', 1000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6485-L', 470.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6487-l', 470.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6488-L', 470.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6490-L', 470.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'check pic up', 1500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'check 6488', 1100.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6486-m', 1400.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6494-m', 1450.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6495-m', 1450.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6493-l', 1000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6492-l', 1000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6492-m', 1450.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6489-l', 450.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6240', 420.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '0977-m', 200.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'check 6490', 1100.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'check 6489', 1100.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6491', 600.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6493-m', 1450.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'sàng cs 5770', 30000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'CH5770', 15000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'C9149-AUTO', 6000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '6491-L', 750.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', 'thổi pic up', 5500.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2421', 160.0, 0, 'active'
UNION ALL
SELECT 'GC', 'Lồng', '2431', 250.0, 0, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'bavia 5770', 15000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'bavia gyx', 15000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'bavia 2556', 15000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'bavia 3880', 15000.0, 0, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'AQL9295', 1650.0, 0, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'AQL15u', 1650.0, 0, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'AQL9276', 1300.0, 0, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'AQL8UY', 1800.0, 0, 'active'
UNION ALL
SELECT 'GC', 'XLBV', 'tuốtkct', 530.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9740', 175.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '2801', 160.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6262', 180.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '7133', 180.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9149', 185.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '598', 175.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '7630', 70.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '4563', 180.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8484', 125.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8485', 125.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '3880', 180.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1080', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1080-G30', 180.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1090', 125.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1090-G30', 180.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1090-12', 195.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1080-12', 190.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1080-14', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1080-17', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1090-14', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1090-17', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '5770', 180.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8234', 125.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8235', 125.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6270', 180.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '5091', 85.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '5092', 85.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9477', 180.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9565-1', 170.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9565-2', 170.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '0575-1', 200.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '0575-2', 145.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6773-1', 170.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6773-2', 170.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8052-1', 110.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8052-2', 110.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '8052-3', 110.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6486-1', 3920.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6486-2', 2800.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6487-1', 1440.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6487-2', 1320.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6488-1', 1260.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6488-2', 1200.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6489-1', 840.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6489-2', 770.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6490-1', 1968.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6490-2', 1440.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6492-1', 2520.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6492-2', 1800.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6492-r', 1800.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6493-1', 2800.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6493-2', 2000.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6493-r', 2000.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6494-1', 2800.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6494-2', 2000.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6494-r', 2000.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6495-1', 2520.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6495-2', 1800.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6495-r', 1800.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1657-phá', 110.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1657-1', 85.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1657-2', 85.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1660-phá', 110.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1660-1', 85.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '1660-2', 85.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '0598-1', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '0598-2', 200.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '5770-1', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '5770-2', 200.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9149-1', 240.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'MAI' AS `process_code`, 'MÀI' AS `work_type`, '9149-2' AS `product_code`, 200.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'MAI', 'MÀI', '6491-1', 12000.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6491-2', 10000.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6485-1', 840.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6485-2', 700.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '7630-1', 150.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '7630-2', 150.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9477-2', 200.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9477-1', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '4563-1', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '4563-2', 200.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9968', 180.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9968-1', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9968-2', 200.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '977', 90.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '575', 90.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6328', 51.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '6330', 51.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9740-1', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '9740-2', 200.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '7133-1', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', 'MÀI', '7133-2', 200.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '123-1', 250.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '123-2', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '125-1', 220.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9276-20', 500.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9276-15', 350.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9276-2', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9276', 260.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5.9999999999999998E-30', 211.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6E/2', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6E', 270.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'PK-1', 266.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'PK-2', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16D-1', 266.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16D-2', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16D-20', 350.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16H-2', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16h', 360.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9276-7', 300.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16H-12', 310.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16M-1', 250.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16M-2', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '16M-20', 330.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2SS-27', 400.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2SS-20', 370.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2SS-28', 400.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2SS-12', 330.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UM-1', 230.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UM-2', 200.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UM-12', 250.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UM-20', 330.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UY-1', 270.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UY-2', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UY', 380.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8W6-1', 230.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8W6-2', 200.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8W6-20', 330.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8W6', 190.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '79C-19', 350.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '79C-20', 470.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '79C', 270.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '79C-2', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'DK1-1', 250.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'DK1-2', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '4001-1', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '4001-2', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5004-1', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5004-2', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8011-1', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '4408', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8011-2', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2402-1', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2402-2', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9906-1', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9906-2', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6900-1', 110.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6900-2', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '125-2', 200.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6001-2', 100.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8um-25', 180.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5243-1', 180.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9276-28', 420.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6004-1', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '6004-2', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '15U', 130.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '0603-1', 100.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '0603-2', 100.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8w6-10', 200.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5243', 130.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'TB-S', 1200.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'TB-N', 2000.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'ch9276', 2000.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9902-1', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9902-2', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9295', 130.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5120-1', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5120-2', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2421', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '2431', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '3311', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9024-1', 110.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9024-2', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '8UY-20', 350.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3C-27', 230.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3F-27', 230.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5140-1', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '5140-2', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '4305-1', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '4305-2', 120.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'sato-tb', 800.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3C-20', 320.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3F-20', 320.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3C-2', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3F-1', 240.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3C-1', 240.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'D02N3F-2', 210.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9500-1', 100.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', '9500-2', 100.0, 0, 'active'
UNION ALL
SELECT 'MAI', '123-1', 'tb-sato', 800.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9740', 380.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9740-7', 260.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '2801', 380.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '2801-8', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6262', 380.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6262-8', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '7133', 380.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '7133-8', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '575', 550.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '0575-6', 280.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9149', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '598', 380.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '0598-8', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '7630', 150.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '4563', 380.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '4563-8', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8484', 850.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8485', 900.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1657', 80.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1657-1', 85.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1657-2', 85.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1660', 85.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1660-1', 85.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1660-2', 85.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1657-LƯU', 23.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1660-LƯU', 23.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '3880', 380.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '3880-8', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1080', 800.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '1090', 850.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770', 380.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770-7', 260.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9565', 160.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9565-1', 300.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9565-2', 300.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8234', 850.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8235', 900.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6773', 120.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6773-1', 240.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6773-2', 240.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'DO' AS `process_code`, 'ĐO' AS `work_type`, '6270' AS `product_code`, 380.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'DO', 'ĐO', '6270-8', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9968', 380.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8052', 80.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8052-1', 120.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8052-2', 120.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8052-3', 120.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '8052-LƯU', 60.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5091', 280.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5092', 90.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9477', 380.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9477-8', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6485', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6486', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6487', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6488', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6489', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6490', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6491', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6492', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6493', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6494', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6495', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 's7630', 800.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 's6773', 800.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 's9565', 800.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'S1657', 500.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 's1660', 500.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 's9149', 1000.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'NẮN+LD', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'NẮN', 300.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'NẮNK', 80.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'nắn 7630', 185.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'nắn 6773', 185.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'NẮN 9565', 185.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '0977-6', 280.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '977', 550.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770-r4', 260.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770-r7', 260.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770-r19', 220.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770-r20', 265.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '5770-r21', 235.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '2801-r4', 260.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '2801-r7', 260.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9740-r19', 220.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '6270-r7', 260.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', '9477-r7', 260.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'TB0575', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6486', 13500.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6487', 2700.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6488', 2700.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6489', 2700.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6490', 2700.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6492', 9000.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6493', 11000.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6494', 9600.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb6495', 9600.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb0977', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'rh ej', 720.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'rh df', 500.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'rh pk', 720.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb8484', 1500.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb8485', 1800.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb1080', 1200.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb1090', 1500.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb8234', 1800.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb8235', 1800.0, 0, 'active'
UNION ALL
SELECT 'DO', 'ĐO', 'tb5092', 720.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '127-2', 598.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '8um-l', 1050.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '9140', 10160.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '127-4', 500.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '127', 450.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '5243', 10160.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '125', 470.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '8um', 950.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '8014', 10160.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '2173', 10160.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '4258', 580.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '8uy', 815.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '1404', 10160.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '9276', 950.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '2SS', 1100.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'gfm', 10160.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'D027U8', 500.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '9116-12', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '127-1', 1100.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '15u', 10060.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '2168', 10060.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '8w6', 580.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '6E', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '123', 580.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '79c', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'dk1', 580.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'dk1-l', 1000.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '6001', 250.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '6900', 550.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '9906', 550.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '8011', 550.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '4001', 550.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '2402', 550.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '5004', 550.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '16d', 580.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '16m', 815.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '16h', 815.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'pk', 580.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'd49', 10160.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '79c-1', 1100.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '4408', 1100.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '603', 550.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '9255', 580.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'CH2SS', 1100.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'n127', 150.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ld27u8', 1350.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TB-S', 1200.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TB-N', 2000.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'n4258', 100.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '9116', 500.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '6004', 350.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'AQL9276', 750.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '9140-4', 350.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'tppkct', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'KCN', 10160.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'KCT', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'NKCT', 170.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'aql2ss', 2000.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TPP9276', 1000.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TPP127', 400.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '9295', 10060.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '9902', 480.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '7236', 1160.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '9024', 500.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TPP4408', 1100.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ND027U8', 100.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TPP9116', 500.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '4258-1', 1160.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ldgfm', 1300.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ld9140', 1300.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ld127', 1300.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ld027u8', 1300.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ld9116', 1000.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ld8014', 1300.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '5120', 500.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '2421', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '2431', 1000.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '3311', 1000.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'D02N3C', 580.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'D02N3F', 580.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'tpp4258', 100.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '5140', 500.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '4305', 500.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'd02n23', 580.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'TPPD02N23', 600.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'ND02N23', 100.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'tb-sato', 800.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '2168-100', 1000.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '5770-r22', 200.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', '2801-r21', 235.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'LD EJ', 1200.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 'LD DF', 950.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'DO' AS `process_code`, '127-2' AS `work_type`, 'tb5091' AS `product_code`, 960.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'DO', '127-2', 's1657-3đ', 300.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 's1660-3đ', 300.0, 0, 'active'
UNION ALL
SELECT 'DO', '127-2', 's8052', 500.0, 0, 'active'
UNION ALL
SELECT 'DO', 'dòng 27', '0', 320.0, 0, 'active'
UNION ALL
SELECT 'DO', 'dòng 29', '3065', 9414.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '2252 ĐG', 3000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3031 ĐG', 1800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3002 đg', 1800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3202 ĐG', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3035 ĐG', 3600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '9665 đg', 32000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '8500 đg', 7500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'h13 đg', 3000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'h17 đg', 3000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'lwl9 ĐG', 10000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'lwl12 ĐG', 10000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '2125 đg', 20000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '2209 đg', 20000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '245 đg', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '174 ĐG', 15000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '173 ĐG', 15000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '175 ĐG', 15000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '247 đg', 1400.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 's1 đg', 12000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'S6 đg', 12000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 's7 đg', 1200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 's17 đg', 2000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'yyu đg', 12000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '234 đg', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '0696 đg', 8000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3202 đóng túi', 900.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3202 xỏ zick + lò xo', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3202 đóng thùng', 1800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3202 bôi bột', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'grip trắng', 50.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '9436 đg', 15000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '2165 đg', 20000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'su520 đg', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'su530 đg', 2000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '6396 đg', 16000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'su 8000', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '161 đg', 15000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '3749 đg', 800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '0696 1', 1200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '0696 2', 1200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '6396 1', 1600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', '6396 2', 1600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐÓNG GÓI CHT', 'g69 đg', 10000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2252 100', 300.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2252 200bktx', 242.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3031 100', 300.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3031 200', 300.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3035 100', 300.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3035 200', 300.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3035 200bktx', 242.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2911', 2000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '262606', 2000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3035 100bktx', 220.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2165-2', 1700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2209-2', 1700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'lwl9', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'lwl12', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2125', 1700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2209', 1700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '245', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '174', 550.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '173', 550.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '175', 550.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '247', 250.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'S1', 250.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'S6', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 's7', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'S17', 250.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'S18', 300.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'S19', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '234', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '696', 800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'key', 800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'sealing', 2000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'grip 50', 120.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'su530', 400.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'su520', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'MR237', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'MR05', 300.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'LWL9-CHBD', 5500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2165', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'top holder', 180.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '9436', 700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'SILENCER', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '6396', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '161', 400.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'yyu', 650.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'L918', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'L919', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '5203', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3749', 300.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'lw-bd', 5000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'lwl12-bd', 5000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3035bk', 400.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3031bk', 400.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3002bk', 400.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '9665', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'g69', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2606', 1700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '173 2', 750.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '175 2', 750.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3031 100bktx', 220.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3002 100bktx', 220.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3002 200bktx', 242.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '174-vm', 950.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '173-vm', 950.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '175-vm', 950.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '174 3', 800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '173 3', 800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '175 3', 800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'E503', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'e409', 300.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'e393', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '6035', 400.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '6036', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'y225', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '2607', 1700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', 'su8000', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'KIỂM', '3031 200bktx', 242.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 2165', 2000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 2252', 300.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', '3002', 300.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 3031', 220.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'H 3035', 220.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 247', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'đg0696-dm', 5000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'đg247-dm', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'MR05 đg', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h h13', 900.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h h17', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h lwl9', 700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h lwl12', 700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 2125', 1700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 2209', 1700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 245', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'H 174', 550.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 173', 550.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 175', 550.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h yyu', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h s6', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h s7', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'hk yyu', 510.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'hk 3035', 187.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h s19', 800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 234', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 0696', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'hk s6', 850.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'AQL 174', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'J498', 250.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'grip 65', 120.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'LWL12-CHBD', 5500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', '174-t', 840.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', '173-t', 840.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', '6396-pp', 700.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'K1' AS `process_code`, 'NGƯỜI MỚI NQ' AS `work_type`, 'hk 247' AS `product_code`, 175.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 6396 1', 1400.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'h 6396 2', 1400.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'e503 đg', 20000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'e409 đg', 20000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'e393 đg', 20000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'l918 đg', 20000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'NGƯỜI MỚI NQ', 'check 3035', 1500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '3002 200bk', 253.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '3031 100bk', 230.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '3031 200bk', 250.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '3035 100bk', 230.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '3035 200bk', 250.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '2252 100bk', 230.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '2252 200bk', 253.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '3002 100bk', 230.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xlbv y3', 450.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '174-m', 1200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '173-m', 1200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'ch 9665', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '9665 1', 1600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', '9665 2', 1600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xl 245', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xl 174', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xl 173', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xl 175', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xl 247', 300.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'lwl9 mới', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'Grip Br', 85.0, 0, 'active'
UNION ALL
SELECT 'K1', 'XLBV', 'xl 234', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', 'bong lw', 230.0, 0, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', '2209 1', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', '2209 2', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', '2209 3', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', '2209 4', 600.0, 0, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', '8500', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'LỒNG', 'LWL12-M', 480.0, 0, 'active'
UNION ALL
SELECT 'K1', 'CẮT', 'ch 173bv', 700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'CẮT', 'ch 174bv', 700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'CẮT', 'ch 175bv', 700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'LĂN DƯỠNG', '174 pp', 450.0, 0, 'active'
UNION ALL
SELECT 'K1', 'LĂN DƯỠNG', '0696 1pp', 800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'LĂN DƯỠNG', '0696 2pp', 800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'lồng zick lòng trong', 1500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 234', 1200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 3035', 3000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 3031', 1500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 247', 2000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 2252', 1500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 245', 1200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'xì hàng 3002', 1500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'check jig 3031', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'ĐO ZIG F', 'lắc jig 3031', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 2252', 253.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check 175', 1500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 3031', 253.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 3035', 253.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '234 tx', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 3202', 2000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '2252 100bktx', 220.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 252911', 2500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 262606', 2500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3202 máy', 230.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check 174', 1500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check 173', 1500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch lwl9', 800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch lwl12', 800.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 2125', 660.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 2209', 1700.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 245', 220.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 174', 572.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 173', 572.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 175', 572.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 247', 280.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch s1', 275.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch s6', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch s7', 1100.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch s17', 275.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch s18', 330.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch s19', 660.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 234', 220.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 0696', 880.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch key', 880.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch sealing', 2200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch grip', 132.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch su530', 440.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch su520', 550.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch MR237', 550.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 0063', 330.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 2165', 660.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check kt', 1500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch top', 198.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 9436', 1100.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 's19 đg', 12000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 161', 440.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 6396', 1100.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3035 3', 253.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3202 3', 450.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3031 3', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '2252 3', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3202 gói', 500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3035 300bk', 220.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '3031 300bk', 220.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', '2252 300bk', 220.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'CH G69', 660.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check yyu', 660.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check 8500', 1500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'ch 8500', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'check lại hàng', 'check 3202', 250.0, 0, 'active'
UNION ALL
SELECT 'K1', 'CHECK SÉT', 'check s6', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'CHECK SÉT', 'CH 174VIA', 1000.0, 0, 'active'
UNION ALL
SELECT 'K1', 'CHECK SÉT', 'ch174', 1500.0, 0, 'active'
UNION ALL
SELECT 'K1', 'CHECK HÀNG NGƯỜI MỚI', 'lwl9 l1', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'CHECK HÀNG NGƯỜI MỚI', 'lwl9 l2', 270.0, 0, 'active'
UNION ALL
SELECT 'K1', 'CHECK HÀNG NGƯỜI MỚI', '247 tx', 250.0, 0, 'active'
UNION ALL
SELECT 'K1', 'CHECK HÀNG NGƯỜI MỚI', 'lwl12 l1', 200.0, 0, 'active'
UNION ALL
SELECT 'K1', 'CHECK HÀNG NGƯỜI MỚI', 'lwl12 l2', 270.0, 0, 'active'
UNION ALL
SELECT 'K1', 'CHECK HÀNG NGƯỜI MỚI', 'lwl12 l3', 100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'Dán thùng', 55.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg5770', 1188.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg5770-dt', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg2801', 1118.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg2801-dt', 1320.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg7133', 1118.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg7133-dt', 1320.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg7960', 1188.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg9149', 1848.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg9149-dt', 2180.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg3880', 1333.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg3880-dt', 1570.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg5091', 400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg5092', 350.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg7630', 528.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg7630-dt', 623.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg9565', 990.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg9565-dt', 1168.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6773', 704.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6773-dt', 730.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1657', 132.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1657-dt', 156.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1660', 165.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1660-dt', 195.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg8484', 4620.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg8484-dt', 5450.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg8485', 4620.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg8485-dt', 5450.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1080', 2310.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1080-dt', 2725.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1090', 3080.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg1090-dt', 3630.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐG0575', 726.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐG0575-dt', 860.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐG8052', 100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐG8052-dt', 120.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6485', 9750.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6486', 64800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6487', 13000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6488', 13000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6489', 13000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6490', 13000.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'K2' AS `process_code`, 'ĐÓNG GÓI CHT' AS `work_type`, 'đg6491' AS `product_code`, 64800.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6492', 57600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6493', 72000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6494', 72000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg6495', 57600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐGD02N3C-R', 4000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐGD02N3F-R', 4000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg7236', 2400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg49', 2400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg5120', 1552.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ks0603', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS4001', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS5004', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS8011', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS2402', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS9906', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS6900', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'KS6001', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'đg2ss', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'tb-s', 1200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'v2ss', 2000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', '15U-LB', 1800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'TB-N', 2000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', '127-l', 1050.0, 0, 'active'
UNION ALL
SELECT 'K2', 'ĐÓNG GÓI CHT', 'ĐG9902', 1600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9740', 392.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5770', 392.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6270', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '2801', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6262', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '7133', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '598', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '7960', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9149', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '4563', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '3880', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5861', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '3438', 430.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5091', 190.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5092', 120.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '7630', 150.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9565', 250.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6773', 150.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '1657', 48.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '1660', 48.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8052', 60.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8484', 490.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8485', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '1080', 450.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '1090', 460.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8234', 490.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8235', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '575', 330.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6485', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6486', 1000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6487', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6488', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6489', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6490', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6492', 1000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6493', 1100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6494', 1100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6495', 1100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9968', 392.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9477', 392.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '977', 330.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'đg6330', 1188.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'đg6328', 1188.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'đg6242', 1188.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'đg6240', 1188.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6396', 1000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '696', 800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9665', 1000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'YYU', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D02N3C-R', 1500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D02N3F-R', 1500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '4305', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D02N23', 625.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D02N3C', 445.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D02N3F', 445.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9024', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5243', 720.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '123', 445.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '125', 400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '7236-R', 1000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '7236', 828.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '2168', 1100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '2173', 840.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '79C', 420.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'DK1', 445.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '4258', 625.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8014', 750.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '127', 450.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9116', 450.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9140', 450.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9276', 630.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '396', 630.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D49', 1100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '15U', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8W6', 445.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'GFM', 750.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '4001', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5004', 315.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8011', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '2402', 315.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9906', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6900', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6001', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '2SS', 630.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6E', 515.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '16H', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8UY', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'PK', 445.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '16D', 445.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '16M', 400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '8UM', 400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '603', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '6004', 315.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'kcn', 840.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'KCT', 625.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D02PD8', 630.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '1432', 1200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '5120', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '1404', 720.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '4408', 720.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9295', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '9902', 315.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', 'D027U8', 450.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '42421', 515.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '42431', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'KIỂM', '43311', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9740', 392.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h5770', 392.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6270', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h2801', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6262', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h7133', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h0598', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h7960', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9149', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h4563', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h3880', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h5861', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h3438', 430.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h7630', 150.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9565', 250.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6773', 150.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h1657', 48.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h1660', 48.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h8484', 490.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h8485', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h1080', 450.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h1090', 460.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h8234', 490.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h8235', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H0575', 330.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6485', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6486', 1000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6487', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6488', 500.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'K2' AS `process_code`, 'NGƯỜI MỚI NQ' AS `work_type`, 'h6489' AS `product_code`, 500.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6490', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6492', 1050.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6493', 1050.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6494', 1050.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6495', 1050.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9968', 392.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9477', 392.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6396', 1000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h0696', 800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9665', 1000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'c0977', 363.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h5243', 504.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h123', 311.5, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h125', 280.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h7236', 579.6, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h2168', 1160.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h2173', 588.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h79c', 294.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'hdk1', 311.5, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h4258', 437.5, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h127', 315.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9116', 315.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9140', 315.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9276', 441.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h396', 441.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'hd49', 770.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h15u', 420.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h8w6', 311.5, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'hgfm', 525.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h4001', 210.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h5004', 220.5, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h8011', 210.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h2402', 220.5, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h9906', 210.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6900', 210.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'h6001', 210.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H2SS', 441.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H6E', 360.5, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H16H', 350.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H8UY', 350.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'HPK', 311.5, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H16D', 311.5, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H16M', 280.0, 0, 'active'
UNION ALL
SELECT 'K2', 'NGƯỜI MỚI NQ', 'H8UM', 280.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9740', 431.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c5770', 431.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6270', 418.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c2801', 418.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6262', 418.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c7133', 418.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c0598', 418.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c7960', 369.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9149', 369.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c4563', 369.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c3880', 369.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c5861', 369.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c3438', 473.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c7630', 165.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9565', 275.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6773', 165.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c1657', 53.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c1660', 53.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8484', 539.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8485', 550.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c1080', 495.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c1090', 506.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8234', 539.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8235', 550.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6485', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6486', 1300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6487', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6488', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6489', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6490', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6492', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6493', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6494', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6495', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9477', 430.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6396', 1100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c0696', 880.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9665', 1100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9968', 430.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c5243', 1146.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c123', 708.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c125', 636.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c7236', 1242.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c2168', 1719.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c2173', 1336.5, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c79c', 669.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'cdk1', 708.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c4258', 994.5, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8014', 1194.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c127', 715.5, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9116', 715.5, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9140', 572.4, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9276', 1002.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c396', 1002.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c49', 1750.5, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c15u', 955.5, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8w6', 708.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'cgfm', 1194.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c4001', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c5004', 315.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8011', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c2402', 315.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c9906', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6900', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6001', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c2ss', 1002.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c6e', 819.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c16h', 795.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8uy', 795.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'cpk', 708.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c16d', 708.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c16m', 636.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c8um', 636.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'c603', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'CKCN', 1260.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'CKCT', 937.5, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'CD02PD8', 937.5, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'C1432', 1800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'C9295', 900.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'chek mốc 907001', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', '9070', 280.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'CKCT200', 300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check hàng người mới', 'CYYU', 700.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6486', 2350.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6487', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6488', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6490', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6492', 2500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6493', 2500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6494', 2500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6495', 2350.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6485 TM', 3000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6486 TM', 4500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6487 TM', 3000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6488 TM', 3000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6489 TM', 3000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6490 TM', 3000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6492 TM', 4500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6493 TM', 4500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6494 TM', 4500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ngược 6495 TM', 4500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'chgyx', 12000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6485', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6486', 1300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6487', 676.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6488', 676.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6489', 676.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6490', 676.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6492', 1430.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6493', 1430.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6494', 1430.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'ch6495', 1430.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'chv-2ss', 1800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'chv-9276', 1800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check ngược+ mặt mài', 'mc4563', 780.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'K2' AS `process_code`, 'Check KT' AS `work_type`, 'KT6485' AS `product_code`, 2000.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'K2', 'Check KT', 'KT6486', 2300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6487', 2000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6488', 2000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6489', 2000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6490', 2000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6492', 2300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6493', 2300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6494', 2300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'KT6495', 2300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'F0575', 1200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'ĐH0575', 1100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'F0977', 1200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'ĐH0977', 1100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'ld ej', 1200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'ld df', 800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'F6494', 1500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6495', 1500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6486', 1500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6488', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6489', 1200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6487', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6490', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'F6493', 1500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'F6492', 1500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'mc6486', 2350.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'mc6494', 2350.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'mc6495', 2350.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f-r0977', 1200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f-r0575', 1200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Check KT', 'f6485', 1200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6487-LCS', 2340.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6488-LCS', 2340.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6490-LCS', 2340.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6489-LCS', 2340.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH9740', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH5770', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH6270', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH2801', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH6262', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH7133', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH0598', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH4563', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH3880', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH9149', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'cgyx', 8000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6486-lcs', 2340.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH1080', 585.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6485-200%', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6486-200%', 1300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6487-200%', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6488-200%', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6489-200%', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6490-200%', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6492-200%', 1300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6493-200%', 1430.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6494-200%', 1430.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6495-200%', 1430.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '6485-lcs', 2340.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9477', 509.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ĐG0977', 726.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ĐG0977-dt', 860.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9968', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch6396', 3000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch0696', 2400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9665', 3000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch5243', 1528.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch123', 944.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch125', 848.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', '7236-ĐG', 2000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch7236', 1738.8, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch2168', 2292.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch2173', 1782.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch79C', 892.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chDK1', 944.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch4258', 1326.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch8014', 1592.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch127', 954.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9116', 954.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9140', 900.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9276', 1449.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch396', 1336.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chD49', 2530.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch15U', 1274.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch8W6', 979.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chGFM', 944.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch4001', 1592.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch5004', 630.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch8011', 890.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch2402', 800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9906', 800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch6900', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch6001', 1200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch2SS', 1336.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch6E', 1255.8, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch16H', 1060.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch8UY', 1060.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chPK', 944.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch16D', 944.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch16M', 848.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch8UM', 848.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch603', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'LB15U', 1274.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CHKCN', 1875.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CHKCT', 1250.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH1432', 2400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'ch9902', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CHD02PD8', 1536.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH9295', 1274.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chd027u8', 954.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'CH5120', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chset8uy', 800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'chset8W6', 800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHECK HÀNG', 'check khay bẩn 15u', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck5770', 2400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK2801', 2400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK6262', 2400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck0598', 2400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck ej', 2400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck1090', 2200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck8234', 2200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck8235', 2200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK8485', 2200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK1080', 2200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK8484', 2200.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK5243', 2336.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck123', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CK7236', 2336.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck2168', 2336.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck2173', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck79c', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck8014', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck127', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck9116', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck9140', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck9276', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'CD49', 800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck8w6', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ckgfm', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck9906', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck6900', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck2ss', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck16h', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck8uy', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ckpk', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck16d', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'VT2SS', 2000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ck8um', 1512.0, 0, 'active'
UNION ALL
SELECT 'K2', 'CHUYỂN KHAY', 'ĐG1432', 60000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6486', 4350.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6487', 1920.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6488', 1920.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6489', 1920.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6490', 1920.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6492', 3720.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6493', 4500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6494', 4500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 't-6495', 3720.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6486', 13500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6487', 2700.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, COALESCE(s.work_type,''), s.product_code, s.standard_output, COALESCE(s.exclude_kqd_from_tt,0), 'active'
FROM (
SELECT 'K2' AS `process_code`, 'Lăn Khoảng sáng' AS `work_type`, 'tb6488' AS `product_code`, 2700.0 AS `standard_output`, 0 AS `exclude_kqd_from_tt`, 'active' AS `status`
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6489', 2700.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6490', 2700.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6492', 9600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6493', 9600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6494', 9600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6495', 9600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb0575', 600.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb6485', 2700.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'tb-df', 1500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6485-200%', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6486-200%', 1300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6487-200%', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6488-200%', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6489-200%', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6490-200%', 650.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6492-200%', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6493-200%', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6494-200%', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'C6495-200%', 1400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'ld0977', 850.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'ch-tắc vòi', 1300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'ch174', 1500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs4001', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs5004', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs8011', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs2402', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs9906', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs6900', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs6001', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs6003', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'HS6004', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'chHV-2SS', 2500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'lđk1', 800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'chHV-9276', 2500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'LD127', 1300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'ld16m', 800.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'LDGFM', 1300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'LD9140', 1300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'LD8014', 1300.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'T-KCT', 400.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs9902', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'LDD027U8', 1350.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'hs5120', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'HS9024', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'XB9902', 450.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'HS4305', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'Lăn Khoảng sáng', 'XLBVT0603', 60.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL9740', 392.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL5770', 392.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6270', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL2801', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6262', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL7133', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL0598', 380.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL7960', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL9149', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL4563', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL3880', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL5861', 335.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL3438', 430.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL5091', 190.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL5092', 120.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL7630', 150.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL9565', 250.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6773', 150.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL1657', 48.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL1660', 48.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL8052', 60.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL8484', 490.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL8485', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL1080', 450.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL1090', 460.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL8234', 490.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL8235', 500.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL0575', 330.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6485', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6486', 1000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6487', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6488', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6489', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6490', 520.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6492', 1000.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6493', 1100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6494', 1100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL6495', 1100.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'AQL9477', 392.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'tt-6494', 2365.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'tt-6495', 1935.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'tt-6488', 855.0, 0, 'active'
UNION ALL
SELECT 'K2', 'AQL', 'tt-6487', 855.0, 0, 'active'
UNION ALL
SELECT 'K2', 'dòng 25', 'CTT-2173', 2720.0, 0, 'active'
UNION ALL
SELECT 'K2', 'dòng 25', 'CTT-2168', 5040.0, 0, 'active'
UNION ALL
SELECT 'K2', 'dòng 25', 'CTT-127', 5040.0, 0, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE work_type=VALUES(work_type), standard_output=VALUES(standard_output), exclude_kqd_from_tt=VALUES(exclude_kqd_from_tt), status='active' ;

-- ============================================================================
-- 6. DANH MỤC TRỪ GIỜ
-- ============================================================================
INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id, s.deduction_code, s.deduction_name, COALESCE(s.sort_order,0), 'active'
FROM (
SELECT 'GC' AS `process_code`, 'THIEU_SAN_LUONG' AS `deduction_code`, 'Thiếu sản lượng' AS `deduction_name`, 1 AS `sort_order`, 'active' AS `status`
UNION ALL
SELECT 'GC', 'BAT_MAY_XET_MAY_AU_GIO', 'Bật máy, xét máy, đầu giờ', 2, 'active'
UNION ALL
SELECT 'GC', 'CHUYEN_MA', 'Chuyển mã', 3, 'active'
UNION ALL
SELECT 'GC', 'CHINH_MAY', 'Chỉnh máy', 4, 'active'
UNION ALL
SELECT 'GC', 'MAI_A', 'Mài đá', 5, 'active'
UNION ALL
SELECT 'GC', 'KHONG_CO_KHSX_DUNG_MAY_KHONG_HT', 'Không có KHSX, Dừng máy không HT', 6, 'active'
UNION ALL
SELECT 'GC', 'CHO_HANG_HET_HANG', 'Chờ hàng, hết hàng', 7, 'active'
UNION ALL
SELECT 'GC', 'NGHI_GIAI_LAO', 'Nghỉ giải lao', 8, 'active'
UNION ALL
SELECT 'GC', 'GIAO_CA', 'Giao ca', 9, 'active'
UNION ALL
SELECT 'GC', '5S_O_BUI_XI_BUI_LAY_BUI', '5S, đổ bụi, xì bụi, lấy bụi', 10, 'active'
UNION ALL
SELECT 'GC', 'BAO_DUONG', 'Bảo dưỡng', 11, 'active'
UNION ALL
SELECT 'GC', 'MAT_IEN', 'Mất điện', 12, 'active'
UNION ALL
SELECT 'GC', 'MAT_KHI', 'Mất khí', 13, 'active'
UNION ALL
SELECT 'GC', 'HO_TRO', 'Hỗ trợ', 14, 'active'
UNION ALL
SELECT 'GC', 'HOC_VIEC', 'Học việc', 15, 'active'
UNION ALL
SELECT 'MAI', 'THIEU_SAN_LUONG', 'Thiếu sản lượng', 1, 'active'
UNION ALL
SELECT 'MAI', 'BAT_MAY_XET_MAY_AU_GIO', 'Bật máy, xét máy, đầu giờ', 2, 'active'
UNION ALL
SELECT 'MAI', 'CHUYEN_MA', 'Chuyển mã', 3, 'active'
UNION ALL
SELECT 'MAI', 'CHINH_MAY', 'Chỉnh máy', 4, 'active'
UNION ALL
SELECT 'MAI', 'MAI_A', 'Mài đá', 5, 'active'
UNION ALL
SELECT 'MAI', 'KHONG_CO_KHSX_DUNG_MAY_KHONG_HT', 'Không có KHSX, Dừng máy không HT', 6, 'active'
UNION ALL
SELECT 'MAI', 'CHO_HANG_HET_HANG', 'Chờ hàng, hết hàng', 7, 'active'
UNION ALL
SELECT 'MAI', 'NGHI_GIAI_LAO', 'Nghỉ giải lao', 8, 'active'
UNION ALL
SELECT 'MAI', 'GIAO_CA', 'Giao ca', 9, 'active'
UNION ALL
SELECT 'MAI', '5S_O_BUI_XI_BUI_LAY_BUI', '5S, đổ bụi, xì bụi, lấy bụi', 10, 'active'
UNION ALL
SELECT 'MAI', 'BAO_DUONG', 'Bảo dưỡng', 11, 'active'
UNION ALL
SELECT 'MAI', 'MAT_IEN', 'Mất điện', 12, 'active'
UNION ALL
SELECT 'MAI', 'MAT_KHI', 'Mất khí', 13, 'active'
UNION ALL
SELECT 'MAI', 'HO_TRO', 'Hỗ trợ', 14, 'active'
UNION ALL
SELECT 'MAI', 'HOC_VIEC', 'Học việc', 15, 'active'
UNION ALL
SELECT 'DO', 'THIEU_SAN_LUONG', 'Thiếu sản lượng', 1, 'active'
UNION ALL
SELECT 'DO', 'BAT_MAY_XET_MAY_AU_GIO', 'Bật máy, xét máy, đầu giờ', 2, 'active'
UNION ALL
SELECT 'DO', 'CHUYEN_MA', 'Chuyển mã', 3, 'active'
UNION ALL
SELECT 'DO', 'CHINH_MAY', 'Chỉnh máy', 4, 'active'
UNION ALL
SELECT 'DO', 'MAI_A', 'Mài đá', 5, 'active'
UNION ALL
SELECT 'DO', 'KHONG_CO_KHSX_DUNG_MAY_KHONG_HT', 'Không có KHSX, Dừng máy không HT', 6, 'active'
UNION ALL
SELECT 'DO', 'CHO_HANG_HET_HANG', 'Chờ hàng, hết hàng', 7, 'active'
UNION ALL
SELECT 'DO', 'NGHI_GIAI_LAO', 'Nghỉ giải lao', 8, 'active'
UNION ALL
SELECT 'DO', 'GIAO_CA', 'Giao ca', 9, 'active'
UNION ALL
SELECT 'DO', '5S_O_BUI_XI_BUI_LAY_BUI', '5S, đổ bụi, xì bụi, lấy bụi', 10, 'active'
UNION ALL
SELECT 'DO', 'BAO_DUONG', 'Bảo dưỡng', 11, 'active'
UNION ALL
SELECT 'DO', 'MAT_IEN', 'Mất điện', 12, 'active'
UNION ALL
SELECT 'DO', 'MAT_KHI', 'Mất khí', 13, 'active'
UNION ALL
SELECT 'DO', 'HO_TRO', 'Hỗ trợ', 14, 'active'
UNION ALL
SELECT 'DO', 'HOC_VIEC', 'Học việc', 15, 'active'
UNION ALL
SELECT 'K1', 'THIEU_SAN_LUONG', 'Thiếu sản lượng', 1, 'active'
UNION ALL
SELECT 'K1', 'BAT_MAY_XET_MAY_AU_GIO', 'Bật máy, xét máy, đầu giờ', 2, 'active'
UNION ALL
SELECT 'K1', 'CHUYEN_MA', 'Chuyển mã', 3, 'active'
UNION ALL
SELECT 'K1', 'CHINH_MAY', 'Chỉnh máy', 4, 'active'
UNION ALL
SELECT 'K1', 'MAI_A', 'Mài đá', 5, 'active'
UNION ALL
SELECT 'K1', 'KHONG_CO_KHSX_DUNG_MAY_KHONG_HT', 'Không có KHSX, Dừng máy không HT', 6, 'active'
UNION ALL
SELECT 'K1', 'CHO_HANG_HET_HANG', 'Chờ hàng, hết hàng', 7, 'active'
UNION ALL
SELECT 'K1', 'NGHI_GIAI_LAO', 'Nghỉ giải lao', 8, 'active'
UNION ALL
SELECT 'K1', 'GIAO_CA', 'Giao ca', 9, 'active'
UNION ALL
SELECT 'K1', '5S_O_BUI_XI_BUI_LAY_BUI', '5S, đổ bụi, xì bụi, lấy bụi', 10, 'active'
UNION ALL
SELECT 'K1', 'BAO_DUONG', 'Bảo dưỡng', 11, 'active'
UNION ALL
SELECT 'K1', 'MAT_IEN', 'Mất điện', 12, 'active'
UNION ALL
SELECT 'K1', 'MAT_KHI', 'Mất khí', 13, 'active'
UNION ALL
SELECT 'K1', 'HO_TRO', 'Hỗ trợ', 14, 'active'
UNION ALL
SELECT 'K1', 'HOC_VIEC', 'Học việc', 15, 'active'
UNION ALL
SELECT 'K2', 'THIEU_SAN_LUONG', 'Thiếu sản lượng', 1, 'active'
UNION ALL
SELECT 'K2', 'BAT_MAY_XET_MAY_AU_GIO', 'Bật máy, xét máy, đầu giờ', 2, 'active'
UNION ALL
SELECT 'K2', 'CHUYEN_MA', 'Chuyển mã', 3, 'active'
UNION ALL
SELECT 'K2', 'CHINH_MAY', 'Chỉnh máy', 4, 'active'
UNION ALL
SELECT 'K2', 'MAI_A', 'Mài đá', 5, 'active'
UNION ALL
SELECT 'K2', 'KHONG_CO_KHSX_DUNG_MAY_KHONG_HT', 'Không có KHSX, Dừng máy không HT', 6, 'active'
UNION ALL
SELECT 'K2', 'CHO_HANG_HET_HANG', 'Chờ hàng, hết hàng', 7, 'active'
UNION ALL
SELECT 'K2', 'NGHI_GIAI_LAO', 'Nghỉ giải lao', 8, 'active'
UNION ALL
SELECT 'K2', 'GIAO_CA', 'Giao ca', 9, 'active'
UNION ALL
SELECT 'K2', '5S_O_BUI_XI_BUI_LAY_BUI', '5S, đổ bụi, xì bụi, lấy bụi', 10, 'active'
UNION ALL
SELECT 'K2', 'BAO_DUONG', 'Bảo dưỡng', 11, 'active'
UNION ALL
SELECT 'K2', 'MAT_IEN', 'Mất điện', 12, 'active'
UNION ALL
SELECT 'K2', 'MAT_KHI', 'Mất khí', 13, 'active'
UNION ALL
SELECT 'K2', 'HO_TRO', 'Hỗ trợ', 14, 'active'
UNION ALL
SELECT 'K2', 'HOC_VIEC', 'Học việc', 15, 'active'
UNION ALL
SELECT 'XLBV', 'THIEU_SAN_LUONG', 'Thiếu sản lượng', 1, 'active'
UNION ALL
SELECT 'XLBV', 'BAT_MAY_XET_MAY_AU_GIO', 'Bật máy, xét máy, đầu giờ', 2, 'active'
UNION ALL
SELECT 'XLBV', 'CHUYEN_MA', 'Chuyển mã', 3, 'active'
UNION ALL
SELECT 'XLBV', 'CHINH_MAY', 'Chỉnh máy', 4, 'active'
UNION ALL
SELECT 'XLBV', 'MAI_A', 'Mài đá', 5, 'active'
UNION ALL
SELECT 'XLBV', 'KHONG_CO_KHSX_DUNG_MAY_KHONG_HT', 'Không có KHSX, Dừng máy không HT', 6, 'active'
UNION ALL
SELECT 'XLBV', 'CHO_HANG_HET_HANG', 'Chờ hàng, hết hàng', 7, 'active'
UNION ALL
SELECT 'XLBV', 'NGHI_GIAI_LAO', 'Nghỉ giải lao', 8, 'active'
UNION ALL
SELECT 'XLBV', 'GIAO_CA', 'Giao ca', 9, 'active'
UNION ALL
SELECT 'XLBV', '5S_O_BUI_XI_BUI_LAY_BUI', '5S, đổ bụi, xì bụi, lấy bụi', 10, 'active'
UNION ALL
SELECT 'XLBV', 'BAO_DUONG', 'Bảo dưỡng', 11, 'active'
UNION ALL
SELECT 'XLBV', 'MAT_IEN', 'Mất điện', 12, 'active'
UNION ALL
SELECT 'XLBV', 'MAT_KHI', 'Mất khí', 13, 'active'
UNION ALL
SELECT 'XLBV', 'HO_TRO', 'Hỗ trợ', 14, 'active'
UNION ALL
SELECT 'XLBV', 'HOC_VIEC', 'Học việc', 15, 'active'
UNION ALL
SELECT 'EP', 'THIEU_SAN_LUONG', 'Thiếu sản lượng', 1, 'active'
UNION ALL
SELECT 'EP', 'BAT_MAY_XET_MAY_AU_GIO', 'Bật máy, xét máy, đầu giờ', 2, 'active'
UNION ALL
SELECT 'EP', 'CHUYEN_MA', 'Chuyển mã', 3, 'active'
UNION ALL
SELECT 'EP', 'CHINH_MAY', 'Chỉnh máy', 4, 'active'
UNION ALL
SELECT 'EP', 'MAI_A', 'Mài đá', 5, 'active'
UNION ALL
SELECT 'EP', 'KHONG_CO_KHSX_DUNG_MAY_KHONG_HT', 'Không có KHSX, Dừng máy không HT', 6, 'active'
UNION ALL
SELECT 'EP', 'CHO_HANG_HET_HANG', 'Chờ hàng, hết hàng', 7, 'active'
UNION ALL
SELECT 'EP', 'NGHI_GIAI_LAO', 'Nghỉ giải lao', 8, 'active'
UNION ALL
SELECT 'EP', 'GIAO_CA', 'Giao ca', 9, 'active'
UNION ALL
SELECT 'EP', '5S_O_BUI_XI_BUI_LAY_BUI', '5S, đổ bụi, xì bụi, lấy bụi', 10, 'active'
UNION ALL
SELECT 'EP', 'BAO_DUONG', 'Bảo dưỡng', 11, 'active'
UNION ALL
SELECT 'EP', 'MAT_IEN', 'Mất điện', 12, 'active'
UNION ALL
SELECT 'EP', 'MAT_KHI', 'Mất khí', 13, 'active'
UNION ALL
SELECT 'EP', 'HO_TRO', 'Hỗ trợ', 14, 'active'
UNION ALL
SELECT 'EP', 'HOC_VIEC', 'Học việc', 15, 'active'
UNION ALL
SELECT 'CAN', 'THIEU_SAN_LUONG', 'Thiếu sản lượng', 1, 'active'
UNION ALL
SELECT 'CAN', 'BAT_MAY_XET_MAY_AU_GIO', 'Bật máy, xét máy, đầu giờ', 2, 'active'
UNION ALL
SELECT 'CAN', 'CHUYEN_MA', 'Chuyển mã', 3, 'active'
UNION ALL
SELECT 'CAN', 'CHINH_MAY', 'Chỉnh máy', 4, 'active'
UNION ALL
SELECT 'CAN', 'MAI_A', 'Mài đá', 5, 'active'
UNION ALL
SELECT 'CAN', 'KHONG_CO_KHSX_DUNG_MAY_KHONG_HT', 'Không có KHSX, Dừng máy không HT', 6, 'active'
UNION ALL
SELECT 'CAN', 'CHO_HANG_HET_HANG', 'Chờ hàng, hết hàng', 7, 'active'
UNION ALL
SELECT 'CAN', 'NGHI_GIAI_LAO', 'Nghỉ giải lao', 8, 'active'
UNION ALL
SELECT 'CAN', 'GIAO_CA', 'Giao ca', 9, 'active'
UNION ALL
SELECT 'CAN', '5S_O_BUI_XI_BUI_LAY_BUI', '5S, đổ bụi, xì bụi, lấy bụi', 10, 'active'
UNION ALL
SELECT 'CAN', 'BAO_DUONG', 'Bảo dưỡng', 11, 'active'
UNION ALL
SELECT 'CAN', 'MAT_IEN', 'Mất điện', 12, 'active'
UNION ALL
SELECT 'CAN', 'MAT_KHI', 'Mất khí', 13, 'active'
UNION ALL
SELECT 'CAN', 'HO_TRO', 'Hỗ trợ', 14, 'active'
UNION ALL
SELECT 'CAN', 'HOC_VIEC', 'Học việc', 15, 'active'
UNION ALL
SELECT 'SX3', 'THIEU_SAN_LUONG', 'Thiếu sản lượng', 1, 'active'
UNION ALL
SELECT 'SX3', 'BAT_MAY_XET_MAY_AU_GIO', 'Bật máy, xét máy, đầu giờ', 2, 'active'
UNION ALL
SELECT 'SX3', 'CHUYEN_MA', 'Chuyển mã', 3, 'active'
UNION ALL
SELECT 'SX3', 'CHINH_MAY', 'Chỉnh máy', 4, 'active'
UNION ALL
SELECT 'SX3', 'MAI_A', 'Mài đá', 5, 'active'
UNION ALL
SELECT 'SX3', 'KHONG_CO_KHSX_DUNG_MAY_KHONG_HT', 'Không có KHSX, Dừng máy không HT', 6, 'active'
UNION ALL
SELECT 'SX3', 'CHO_HANG_HET_HANG', 'Chờ hàng, hết hàng', 7, 'active'
UNION ALL
SELECT 'SX3', 'NGHI_GIAI_LAO', 'Nghỉ giải lao', 8, 'active'
UNION ALL
SELECT 'SX3', 'GIAO_CA', 'Giao ca', 9, 'active'
UNION ALL
SELECT 'SX3', '5S_O_BUI_XI_BUI_LAY_BUI', '5S, đổ bụi, xì bụi, lấy bụi', 10, 'active'
UNION ALL
SELECT 'SX3', 'BAO_DUONG', 'Bảo dưỡng', 11, 'active'
UNION ALL
SELECT 'SX3', 'MAT_IEN', 'Mất điện', 12, 'active'
UNION ALL
SELECT 'SX3', 'MAT_KHI', 'Mất khí', 13, 'active'
UNION ALL
SELECT 'SX3', 'HO_TRO', 'Hỗ trợ', 14, 'active'
UNION ALL
SELECT 'SX3', 'HOC_VIEC', 'Học việc', 15, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE deduction_name=VALUES(deduction_name), sort_order=VALUES(sort_order), status='active' ;

-- ============================================================================
-- 7. DANH MỤC LỖI NG
-- ============================================================================
INSERT INTO defect_types (process_id, defect_code, defect_name, sort_order, status)
SELECT p.id, s.defect_code, s.defect_name, COALESCE(s.sort_order,0), 'active'
FROM (
SELECT 'GC' AS `process_code`, 'KQD' AS `defect_code`, 'KQD' AS `defect_name`, 1 AS `sort_order`, 'active' AS `status`
UNION ALL
SELECT 'GC', 'CHAN_KHONG', 'Chân không', 2, 'active'
UNION ALL
SELECT 'GC', 'RACH_VO', 'Rách vỡ', 3, 'active'
UNION ALL
SELECT 'GC', 'BAVIA', 'Bavia', 4, 'active'
UNION ALL
SELECT 'GC', 'CAT_KHONG_UT', 'Cắt không đứt', 5, 'active'
UNION ALL
SELECT 'GC', 'CAT_LEM', 'Cắt lẹm', 6, 'active'
UNION ALL
SELECT 'GC', 'RACH_NGUYEN_VAT_LIEU', 'Rách nguyên vật liệu', 7, 'active'
UNION ALL
SELECT 'GC', 'SOT_VIA', 'Sót via', 8, 'active'
UNION ALL
SELECT 'GC', 'KICH_THUOC_LON', 'Kích thước lớn', 9, 'active'
UNION ALL
SELECT 'GC', 'KICH_THUOC_NHO', 'Kích thước nhỏ', 10, 'active'
UNION ALL
SELECT 'GC', 'CSH', 'CSH', 11, 'active'
UNION ALL
SELECT 'GC', 'PPCM', 'PPCM', 12, 'active'
UNION ALL
SELECT 'GC', 'LCS', 'LCS', 13, 'active'
UNION ALL
SELECT 'GC', 'FURE_TRUC', 'Fure trục', 14, 'active'
UNION ALL
SELECT 'GC', 'VO_CAO_SU', 'Vỡ cao su', 15, 'active'
UNION ALL
SELECT 'MAI', 'KQD', 'KQD', 1, 'active'
UNION ALL
SELECT 'MAI', 'CHAN_KHONG', 'Chân không', 2, 'active'
UNION ALL
SELECT 'MAI', 'RACH_VO', 'Rách vỡ', 3, 'active'
UNION ALL
SELECT 'MAI', 'BAVIA', 'Bavia', 4, 'active'
UNION ALL
SELECT 'MAI', 'CAT_KHONG_UT', 'Cắt không đứt', 5, 'active'
UNION ALL
SELECT 'MAI', 'CAT_LEM', 'Cắt lẹm', 6, 'active'
UNION ALL
SELECT 'MAI', 'RACH_NGUYEN_VAT_LIEU', 'Rách nguyên vật liệu', 7, 'active'
UNION ALL
SELECT 'MAI', 'SOT_VIA', 'Sót via', 8, 'active'
UNION ALL
SELECT 'MAI', 'KICH_THUOC_LON', 'Kích thước lớn', 9, 'active'
UNION ALL
SELECT 'MAI', 'KICH_THUOC_NHO', 'Kích thước nhỏ', 10, 'active'
UNION ALL
SELECT 'MAI', 'CSH', 'CSH', 11, 'active'
UNION ALL
SELECT 'MAI', 'PPCM', 'PPCM', 12, 'active'
UNION ALL
SELECT 'MAI', 'LCS', 'LCS', 13, 'active'
UNION ALL
SELECT 'MAI', 'FURE_TRUC', 'Fure trục', 14, 'active'
UNION ALL
SELECT 'MAI', 'VO_CAO_SU', 'Vỡ cao su', 15, 'active'
UNION ALL
SELECT 'DO', 'KQD', 'KQD', 1, 'active'
UNION ALL
SELECT 'DO', 'CHAN_KHONG', 'Chân không', 2, 'active'
UNION ALL
SELECT 'DO', 'RACH_VO', 'Rách vỡ', 3, 'active'
UNION ALL
SELECT 'DO', 'BAVIA', 'Bavia', 4, 'active'
UNION ALL
SELECT 'DO', 'CAT_KHONG_UT', 'Cắt không đứt', 5, 'active'
UNION ALL
SELECT 'DO', 'CAT_LEM', 'Cắt lẹm', 6, 'active'
UNION ALL
SELECT 'DO', 'RACH_NGUYEN_VAT_LIEU', 'Rách nguyên vật liệu', 7, 'active'
UNION ALL
SELECT 'DO', 'SOT_VIA', 'Sót via', 8, 'active'
UNION ALL
SELECT 'DO', 'KICH_THUOC_LON', 'Kích thước lớn', 9, 'active'
UNION ALL
SELECT 'DO', 'KICH_THUOC_NHO', 'Kích thước nhỏ', 10, 'active'
UNION ALL
SELECT 'DO', 'CSH', 'CSH', 11, 'active'
UNION ALL
SELECT 'DO', 'PPCM', 'PPCM', 12, 'active'
UNION ALL
SELECT 'DO', 'LCS', 'LCS', 13, 'active'
UNION ALL
SELECT 'DO', 'FURE_TRUC', 'Fure trục', 14, 'active'
UNION ALL
SELECT 'DO', 'VO_CAO_SU', 'Vỡ cao su', 15, 'active'
UNION ALL
SELECT 'K1', 'KQD', 'KQD', 1, 'active'
UNION ALL
SELECT 'K1', 'CHAN_KHONG', 'Chân không', 2, 'active'
UNION ALL
SELECT 'K1', 'RACH_VO', 'Rách vỡ', 3, 'active'
UNION ALL
SELECT 'K1', 'BAVIA', 'Bavia', 4, 'active'
UNION ALL
SELECT 'K1', 'CAT_KHONG_UT', 'Cắt không đứt', 5, 'active'
UNION ALL
SELECT 'K1', 'CAT_LEM', 'Cắt lẹm', 6, 'active'
UNION ALL
SELECT 'K1', 'RACH_NGUYEN_VAT_LIEU', 'Rách nguyên vật liệu', 7, 'active'
UNION ALL
SELECT 'K1', 'SOT_VIA', 'Sót via', 8, 'active'
UNION ALL
SELECT 'K1', 'KICH_THUOC_LON', 'Kích thước lớn', 9, 'active'
UNION ALL
SELECT 'K1', 'KICH_THUOC_NHO', 'Kích thước nhỏ', 10, 'active'
UNION ALL
SELECT 'K1', 'CSH', 'CSH', 11, 'active'
UNION ALL
SELECT 'K1', 'PPCM', 'PPCM', 12, 'active'
UNION ALL
SELECT 'K1', 'LCS', 'LCS', 13, 'active'
UNION ALL
SELECT 'K1', 'FURE_TRUC', 'Fure trục', 14, 'active'
UNION ALL
SELECT 'K1', 'VO_CAO_SU', 'Vỡ cao su', 15, 'active'
UNION ALL
SELECT 'K2', 'KQD', 'KQD', 1, 'active'
UNION ALL
SELECT 'K2', 'CHAN_KHONG', 'Chân không', 2, 'active'
UNION ALL
SELECT 'K2', 'RACH_VO', 'Rách vỡ', 3, 'active'
UNION ALL
SELECT 'K2', 'BAVIA', 'Bavia', 4, 'active'
UNION ALL
SELECT 'K2', 'CAT_KHONG_UT', 'Cắt không đứt', 5, 'active'
UNION ALL
SELECT 'K2', 'CAT_LEM', 'Cắt lẹm', 6, 'active'
UNION ALL
SELECT 'K2', 'RACH_NGUYEN_VAT_LIEU', 'Rách nguyên vật liệu', 7, 'active'
UNION ALL
SELECT 'K2', 'SOT_VIA', 'Sót via', 8, 'active'
UNION ALL
SELECT 'K2', 'KICH_THUOC_LON', 'Kích thước lớn', 9, 'active'
UNION ALL
SELECT 'K2', 'KICH_THUOC_NHO', 'Kích thước nhỏ', 10, 'active'
UNION ALL
SELECT 'K2', 'CSH', 'CSH', 11, 'active'
UNION ALL
SELECT 'K2', 'PPCM', 'PPCM', 12, 'active'
UNION ALL
SELECT 'K2', 'LCS', 'LCS', 13, 'active'
UNION ALL
SELECT 'K2', 'FURE_TRUC', 'Fure trục', 14, 'active'
UNION ALL
SELECT 'K2', 'VO_CAO_SU', 'Vỡ cao su', 15, 'active'
UNION ALL
SELECT 'XLBV', 'KQD', 'KQD', 1, 'active'
UNION ALL
SELECT 'XLBV', 'CHAN_KHONG', 'Chân không', 2, 'active'
UNION ALL
SELECT 'XLBV', 'RACH_VO', 'Rách vỡ', 3, 'active'
UNION ALL
SELECT 'XLBV', 'BAVIA', 'Bavia', 4, 'active'
UNION ALL
SELECT 'XLBV', 'CAT_KHONG_UT', 'Cắt không đứt', 5, 'active'
UNION ALL
SELECT 'XLBV', 'CAT_LEM', 'Cắt lẹm', 6, 'active'
UNION ALL
SELECT 'XLBV', 'RACH_NGUYEN_VAT_LIEU', 'Rách nguyên vật liệu', 7, 'active'
UNION ALL
SELECT 'XLBV', 'SOT_VIA', 'Sót via', 8, 'active'
UNION ALL
SELECT 'XLBV', 'KICH_THUOC_LON', 'Kích thước lớn', 9, 'active'
UNION ALL
SELECT 'XLBV', 'KICH_THUOC_NHO', 'Kích thước nhỏ', 10, 'active'
UNION ALL
SELECT 'XLBV', 'CSH', 'CSH', 11, 'active'
UNION ALL
SELECT 'XLBV', 'PPCM', 'PPCM', 12, 'active'
UNION ALL
SELECT 'XLBV', 'LCS', 'LCS', 13, 'active'
UNION ALL
SELECT 'XLBV', 'FURE_TRUC', 'Fure trục', 14, 'active'
UNION ALL
SELECT 'XLBV', 'VO_CAO_SU', 'Vỡ cao su', 15, 'active'
UNION ALL
SELECT 'EP', 'KQD', 'KQD', 1, 'active'
UNION ALL
SELECT 'EP', 'CHAN_KHONG', 'Chân không', 2, 'active'
UNION ALL
SELECT 'EP', 'RACH_VO', 'Rách vỡ', 3, 'active'
UNION ALL
SELECT 'EP', 'BAVIA', 'Bavia', 4, 'active'
UNION ALL
SELECT 'EP', 'CAT_KHONG_UT', 'Cắt không đứt', 5, 'active'
UNION ALL
SELECT 'EP', 'CAT_LEM', 'Cắt lẹm', 6, 'active'
UNION ALL
SELECT 'EP', 'RACH_NGUYEN_VAT_LIEU', 'Rách nguyên vật liệu', 7, 'active'
UNION ALL
SELECT 'EP', 'SOT_VIA', 'Sót via', 8, 'active'
UNION ALL
SELECT 'EP', 'KICH_THUOC_LON', 'Kích thước lớn', 9, 'active'
UNION ALL
SELECT 'EP', 'KICH_THUOC_NHO', 'Kích thước nhỏ', 10, 'active'
UNION ALL
SELECT 'EP', 'CSH', 'CSH', 11, 'active'
UNION ALL
SELECT 'EP', 'PPCM', 'PPCM', 12, 'active'
UNION ALL
SELECT 'EP', 'LCS', 'LCS', 13, 'active'
UNION ALL
SELECT 'EP', 'FURE_TRUC', 'Fure trục', 14, 'active'
UNION ALL
SELECT 'EP', 'VO_CAO_SU', 'Vỡ cao su', 15, 'active'
UNION ALL
SELECT 'CAN', 'KQD', 'KQD', 1, 'active'
UNION ALL
SELECT 'CAN', 'CHAN_KHONG', 'Chân không', 2, 'active'
UNION ALL
SELECT 'CAN', 'RACH_VO', 'Rách vỡ', 3, 'active'
UNION ALL
SELECT 'CAN', 'BAVIA', 'Bavia', 4, 'active'
UNION ALL
SELECT 'CAN', 'CAT_KHONG_UT', 'Cắt không đứt', 5, 'active'
UNION ALL
SELECT 'CAN', 'CAT_LEM', 'Cắt lẹm', 6, 'active'
UNION ALL
SELECT 'CAN', 'RACH_NGUYEN_VAT_LIEU', 'Rách nguyên vật liệu', 7, 'active'
UNION ALL
SELECT 'CAN', 'SOT_VIA', 'Sót via', 8, 'active'
UNION ALL
SELECT 'CAN', 'KICH_THUOC_LON', 'Kích thước lớn', 9, 'active'
UNION ALL
SELECT 'CAN', 'KICH_THUOC_NHO', 'Kích thước nhỏ', 10, 'active'
UNION ALL
SELECT 'CAN', 'CSH', 'CSH', 11, 'active'
UNION ALL
SELECT 'CAN', 'PPCM', 'PPCM', 12, 'active'
UNION ALL
SELECT 'CAN', 'LCS', 'LCS', 13, 'active'
UNION ALL
SELECT 'CAN', 'FURE_TRUC', 'Fure trục', 14, 'active'
UNION ALL
SELECT 'CAN', 'VO_CAO_SU', 'Vỡ cao su', 15, 'active'
UNION ALL
SELECT 'SX3', 'KQD', 'KQD', 1, 'active'
UNION ALL
SELECT 'SX3', 'CHAN_KHONG', 'Chân không', 2, 'active'
UNION ALL
SELECT 'SX3', 'RACH_VO', 'Rách vỡ', 3, 'active'
UNION ALL
SELECT 'SX3', 'BAVIA', 'Bavia', 4, 'active'
UNION ALL
SELECT 'SX3', 'CAT_KHONG_UT', 'Cắt không đứt', 5, 'active'
UNION ALL
SELECT 'SX3', 'CAT_LEM', 'Cắt lẹm', 6, 'active'
UNION ALL
SELECT 'SX3', 'RACH_NGUYEN_VAT_LIEU', 'Rách nguyên vật liệu', 7, 'active'
UNION ALL
SELECT 'SX3', 'SOT_VIA', 'Sót via', 8, 'active'
UNION ALL
SELECT 'SX3', 'KICH_THUOC_LON', 'Kích thước lớn', 9, 'active'
UNION ALL
SELECT 'SX3', 'KICH_THUOC_NHO', 'Kích thước nhỏ', 10, 'active'
UNION ALL
SELECT 'SX3', 'CSH', 'CSH', 11, 'active'
UNION ALL
SELECT 'SX3', 'PPCM', 'PPCM', 12, 'active'
UNION ALL
SELECT 'SX3', 'LCS', 'LCS', 13, 'active'
UNION ALL
SELECT 'SX3', 'FURE_TRUC', 'Fure trục', 14, 'active'
UNION ALL
SELECT 'SX3', 'VO_CAO_SU', 'Vỡ cao su', 15, 'active'
) AS s
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code))
ON DUPLICATE KEY UPDATE defect_name=VALUES(defect_name), sort_order=VALUES(sort_order), status='active' ;

-- ============================================================================
-- 8. TÀI KHOẢN CÔNG NHÂN (MẬT KHẨU MẶC ĐỊNH: 123456)
-- ============================================================================
INSERT INTO users (username, password, full_name, role, status)
SELECT s.username, s.password, s.full_name, 'worker', 'active'
FROM (
SELECT '1' AS `username`, '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6' AS `password`, 'MÙI THI MAI LOAN' AS `full_name`, 'worker' AS `role`, 'active' AS `status`
UNION ALL
SELECT '100', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Văn Đạt', 'worker', 'active'
UNION ALL
SELECT '1007', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'NGUYỄN THỊ HOA', 'worker', 'active'
UNION ALL
SELECT '1010', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'ĐINH THU HÀ', 'worker', 'active'
UNION ALL
SELECT '102', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Văn Quang', 'worker', 'active'
UNION ALL
SELECT '1020', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Thiều', 'worker', 'active'
UNION ALL
SELECT '104', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Thị Kim Huệ', 'worker', 'active'
UNION ALL
SELECT '107', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phan Thị Huyền', 'worker', 'active'
UNION ALL
SELECT '108', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nông Đức Khánh', 'worker', 'active'
UNION ALL
SELECT '109', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Duy Văn', 'worker', 'active'
UNION ALL
SELECT '1094', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Quốc Huy', 'worker', 'active'
UNION ALL
SELECT '110', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Văn Vinh', 'worker', 'active'
UNION ALL
SELECT '111', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Pờ Thanh Tình', 'worker', 'active'
UNION ALL
SELECT '112', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Thị Nhi', 'worker', 'active'
UNION ALL
SELECT '113', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Cay', 'worker', 'active'
UNION ALL
SELECT '1134', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Thủy', 'worker', 'active'
UNION ALL
SELECT '117', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'DINH DUC LOI', 'worker', 'active'
UNION ALL
SELECT '118', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'SỒNG CHÍNH PHỦ', 'worker', 'active'
UNION ALL
SELECT '124', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trương Anh Thư', 'worker', 'active'
UNION ALL
SELECT '1246', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Quang Tuấn', 'worker', 'active'
UNION ALL
SELECT '1253', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Thị Chi', 'worker', 'active'
UNION ALL
SELECT '126', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'LUONG HONG QUAN', 'worker', 'active'
UNION ALL
SELECT '13', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đào Anh Đức', 'worker', 'active'
UNION ALL
SELECT '1328', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Minh Chí', 'worker', 'active'
UNION ALL
SELECT '1333', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Thư', 'worker', 'active'
UNION ALL
SELECT '1369', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'HIỀN THU SXC', 'worker', 'active'
UNION ALL
SELECT '140', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Lan Anh', 'worker', 'active'
UNION ALL
SELECT '141', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Minh Anh', 'worker', 'active'
UNION ALL
SELECT '1443', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Khuyên', 'worker', 'active'
UNION ALL
SELECT '1445', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Duy Tường', 'worker', 'active'
UNION ALL
SELECT '1446', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Đức Lương', 'worker', 'active'
UNION ALL
SELECT '1448', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Thị Dung', 'worker', 'active'
UNION ALL
SELECT '146', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Thùy Dương', 'worker', 'active'
UNION ALL
SELECT '1476', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đào Thị Phương', 'worker', 'active'
UNION ALL
SELECT '1493', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nhật Anh', 'worker', 'active'
UNION ALL
SELECT '152', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Trần Bảo Linh', 'worker', 'active'
UNION ALL
SELECT '153', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phan Thùy Linh', 'worker', 'active'
UNION ALL
SELECT '1541', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Quang Vinh', 'worker', 'active'
UNION ALL
SELECT '1562', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thế Chưởng', 'worker', 'active'
UNION ALL
SELECT '1571', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Đình Vui', 'worker', 'active'
UNION ALL
SELECT '1572', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Thị Diên', 'worker', 'active'
UNION ALL
SELECT '159', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Diệu Thảo', 'worker', 'active'
UNION ALL
SELECT '1594', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Thế Vinh', 'worker', 'active'
UNION ALL
SELECT '1610', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trịnh Thu Hằng', 'worker', 'active'
UNION ALL
SELECT '1643', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Minh Hiền', 'worker', 'active'
UNION ALL
SELECT '1656', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Thị Diệu My', 'worker', 'active'
UNION ALL
SELECT '1677', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Trọng Nguyện', 'worker', 'active'
UNION ALL
SELECT '1700', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Văn Thái', 'worker', 'active'
UNION ALL
SELECT '1733', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Ngân', 'worker', 'active'
UNION ALL
SELECT '1777', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Văn Khánh', 'worker', 'active'
UNION ALL
SELECT '1845', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Vân', 'worker', 'active'
UNION ALL
SELECT '1850', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Thị Gấm', 'worker', 'active'
UNION ALL
SELECT '1933', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vũ Đình Tông', 'worker', 'active'
UNION ALL
SELECT '1963', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Cảnh Dinh', 'worker', 'active'
UNION ALL
SELECT '2', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'AO', 'worker', 'active'
UNION ALL
SELECT '2009', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Cao Thị Thu', 'worker', 'active'
UNION ALL
SELECT '2010', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Chu thị Hường', 'worker', 'active'
UNION ALL
SELECT '2030', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Diệu', 'worker', 'active'
UNION ALL
SELECT '2210', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Thị Thu Hảo', 'worker', 'active'
UNION ALL
SELECT '2278', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Sa Thị Ương', 'worker', 'active'
UNION ALL
SELECT '2284', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Mư', 'worker', 'active'
UNION ALL
SELECT '2327', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Văn Phúc', 'worker', 'active'
UNION ALL
SELECT '2374', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Cẩm Tiên', 'worker', 'active'
UNION ALL
SELECT '2399', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Văn Tuấn', 'worker', 'active'
UNION ALL
SELECT '2461', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thanh Thùy', 'worker', 'active'
UNION ALL
SELECT '2488', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Loan', 'worker', 'active'
UNION ALL
SELECT '25', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vũ Ngọc Bảo Nam', 'worker', 'active'
UNION ALL
SELECT '2516', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Cúc', 'worker', 'active'
UNION ALL
SELECT '2545', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'diệu linh', 'worker', 'active'
UNION ALL
SELECT '2564', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Phuơng Thảo', 'worker', 'active'
UNION ALL
SELECT '2625', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Ma THị Bình SXC', 'worker', 'active'
UNION ALL
SELECT '2631', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vi Văn Dậu', 'worker', 'active'
UNION ALL
SELECT '2643', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Văn Ngọc', 'worker', 'active'
UNION ALL
SELECT '2649', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Hoan', 'worker', 'active'
UNION ALL
SELECT '2747', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Văn Thông', 'worker', 'active'
UNION ALL
SELECT '2756', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vương Đắc Thị Oanh', 'worker', 'active'
UNION ALL
SELECT '2763', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Triệu Văn Tiến', 'worker', 'active'
UNION ALL
SELECT '2794', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn.T.Thanh Giang', 'worker', 'active'
UNION ALL
SELECT '2798', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Văn Tuấn', 'worker', 'active'
UNION ALL
SELECT '2804', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Tuyết', 'worker', 'active'
UNION ALL
SELECT '2837', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Văn Bảy', 'worker', 'active'
UNION ALL
SELECT '2849', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Thị Sung', 'worker', 'active'
UNION ALL
SELECT '2851', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Thị Thao', 'worker', 'active'
UNION ALL
SELECT '2856', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Quàng Văn Sáng', 'worker', 'active'
UNION ALL
SELECT '2865', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Thiếu', 'worker', 'active'
UNION ALL
SELECT '2866', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vũ Đình Quang', 'worker', 'active'
UNION ALL
SELECT '2890', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'La Văn La', 'worker', 'active'
UNION ALL
SELECT '2895', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Trang', 'worker', 'active'
UNION ALL
SELECT '2938', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Văn Mai', 'worker', 'active'
UNION ALL
SELECT '2959', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Văn Chường', 'worker', 'active'
UNION ALL
SELECT '2960', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Thị Thăng', 'worker', 'active'
UNION ALL
SELECT '2984', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Uyên', 'worker', 'active'
UNION ALL
SELECT '3', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Sống A Chịa', 'worker', 'active'
UNION ALL
SELECT '3037', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vương Văn Tan', 'worker', 'active'
UNION ALL
SELECT '3046', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Giang Thị Mậu', 'worker', 'active'
UNION ALL
SELECT '3111', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Quàng Thị Tiến', 'worker', 'active'
UNION ALL
SELECT '3123', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Thị Vân', 'worker', 'active'
UNION ALL
SELECT '3130', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lù Văn Nghiệp', 'worker', 'active'
UNION ALL
SELECT '3135', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Cầm Thị Phú', 'worker', 'active'
UNION ALL
SELECT '3171', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Văn Huy', 'worker', 'active'
UNION ALL
SELECT '3187', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Duân', 'worker', 'active'
UNION ALL
SELECT '3234', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Văn Dương', 'worker', 'active'
UNION ALL
SELECT '3244', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Văn Biên', 'worker', 'active'
UNION ALL
SELECT '3258', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'La Văn Duy', 'worker', 'active'
UNION ALL
SELECT '3263', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Thị Lan Hương', 'worker', 'active'
UNION ALL
SELECT '3268', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Điêu Chính Huynh', 'worker', 'active'
UNION ALL
SELECT '3277', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Liệu', 'worker', 'active'
UNION ALL
SELECT '3289', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Quàng Văn Hương', 'worker', 'active'
UNION ALL
SELECT '3292', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Kim Oanh', 'worker', 'active'
UNION ALL
SELECT '3293', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Thị Tươn', 'worker', 'active'
UNION ALL
SELECT '3295', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Nhi', 'worker', 'active'
UNION ALL
SELECT '3300', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Văn Thưởng', 'worker', 'active'
UNION ALL
SELECT '3302', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Quang Thế', 'worker', 'active'
UNION ALL
SELECT '3303', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Văn Thắng', 'worker', 'active'
UNION ALL
SELECT '3304', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Văn khanh', 'worker', 'active'
UNION ALL
SELECT '3305', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Khuyên', 'worker', 'active'
UNION ALL
SELECT '3321', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Văn Thân', 'worker', 'active'
UNION ALL
SELECT '3324', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Văn Thỏa', 'worker', 'active'
UNION ALL
SELECT '3337', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Văn Hùng', 'worker', 'active'
UNION ALL
SELECT '3343', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Ngần Văn Hiền', 'worker', 'active'
UNION ALL
SELECT '3349', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Văn Bằng', 'worker', 'active'
UNION ALL
SELECT '3351', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Hà', 'worker', 'active'
UNION ALL
SELECT '3352', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Văn Sĩ', 'worker', 'active'
UNION ALL
SELECT '3353', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Thùy', 'worker', 'active'
UNION ALL
SELECT '3371', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Ma Thị Nhung', 'worker', 'active'
UNION ALL
SELECT '3372', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bàn Thị Mao', 'worker', 'active'
UNION ALL
SELECT '3377', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Cam', 'worker', 'active'
UNION ALL
SELECT '3379', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lưu Thị Kim Nhung', 'worker', 'active'
UNION ALL
SELECT '3380', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Ngần Văn Bảy', 'worker', 'active'
UNION ALL
SELECT '3388', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Tuyết Oanh', 'worker', 'active'
UNION ALL
SELECT '3390', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Cà Thị Mai', 'worker', 'active'
UNION ALL
SELECT '3394', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Thị Như Quỳnh', 'worker', 'active'
UNION ALL
SELECT '3398', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Thị Trang', 'worker', 'active'
UNION ALL
SELECT '3414', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị He', 'worker', 'active'
UNION ALL
SELECT '342', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Anh Sơn', 'worker', 'active'
UNION ALL
SELECT '3421', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Thị Thoa', 'worker', 'active'
UNION ALL
SELECT '3456', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Thị Sọt', 'worker', 'active'
UNION ALL
SELECT '3499', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Long', 'worker', 'active'
UNION ALL
SELECT '352', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'LUONG VAN MANH', 'worker', 'active'
UNION ALL
SELECT '3526', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Tân', 'worker', 'active'
UNION ALL
SELECT '3567', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Văn Mạnh', 'worker', 'active'
UNION ALL
SELECT '357', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Diệu Ly', 'worker', 'active'
UNION ALL
SELECT '3571', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Tạ Thị Thúy Quỳnh', 'worker', 'active'
UNION ALL
SELECT '3588', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Nguyên', 'worker', 'active'
UNION ALL
SELECT '3590', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Xồng Bá Lông', 'worker', 'active'
UNION ALL
SELECT '3605', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đào Thị Hồng', 'worker', 'active'
UNION ALL
SELECT '3606', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Thùy Dương', 'worker', 'active'
UNION ALL
SELECT '3607', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Tô Thị Thao', 'worker', 'active'
UNION ALL
SELECT '3617', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Hiệp', 'worker', 'active'
UNION ALL
SELECT '3619', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Cương', 'worker', 'active'
) AS s
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), status='active' ;

INSERT INTO users (username, password, full_name, role, status)
SELECT s.username, s.password, s.full_name, 'worker', 'active'
FROM (
SELECT '3622' AS `username`, '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6' AS `password`, 'Lường Thị Ngân' AS `full_name`, 'worker' AS `role`, 'active' AS `status`
UNION ALL
SELECT '3626', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Nga', 'worker', 'active'
UNION ALL
SELECT '3632', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Loan', 'worker', 'active'
UNION ALL
SELECT '3637', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trương Thị Nội', 'worker', 'active'
UNION ALL
SELECT '3638', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Tuyết', 'worker', 'active'
UNION ALL
SELECT '3645', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lỳ Y Sia', 'worker', 'active'
UNION ALL
SELECT '3648', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Ngần Thị Duyên', 'worker', 'active'
UNION ALL
SELECT '3650', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Xồng Bá Quân', 'worker', 'active'
UNION ALL
SELECT '3653', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Thị Yên', 'worker', 'active'
UNION ALL
SELECT '3668', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Khương Minh Tuyền', 'worker', 'active'
UNION ALL
SELECT '3671', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Tương', 'worker', 'active'
UNION ALL
SELECT '3673', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Thị Tuyên', 'worker', 'active'
UNION ALL
SELECT '3675', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Hỏa', 'worker', 'active'
UNION ALL
SELECT '3693', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Văn Định', 'worker', 'active'
UNION ALL
SELECT '3694', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đặng Xuân THành', 'worker', 'active'
UNION ALL
SELECT '3695', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Quyến', 'worker', 'active'
UNION ALL
SELECT '3712', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Nhung', 'worker', 'active'
UNION ALL
SELECT '3713', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Thị Hương', 'worker', 'active'
UNION ALL
SELECT '3715', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Văn Thoản', 'worker', 'active'
UNION ALL
SELECT '3743', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Phương Anh', 'worker', 'active'
UNION ALL
SELECT '3745', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Từ Xuân Cường', 'worker', 'active'
UNION ALL
SELECT '3751', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Đức Vinh', 'worker', 'active'
UNION ALL
SELECT '3752', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Oanh', 'worker', 'active'
UNION ALL
SELECT '3758', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đặng Văn Xuân', 'worker', 'active'
UNION ALL
SELECT '3759', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Hồng Ngát', 'worker', 'active'
UNION ALL
SELECT '376', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'HÀ VĂN CHUNG', 'worker', 'active'
UNION ALL
SELECT '3766', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Xồng Bá Rê', 'worker', 'active'
UNION ALL
SELECT '3769', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Văn Hào', 'worker', 'active'
UNION ALL
SELECT '3771', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Ma Công Hạ', 'worker', 'active'
UNION ALL
SELECT '3772', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Thị Thương', 'worker', 'active'
UNION ALL
SELECT '3779', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Văn Tiến', 'worker', 'active'
UNION ALL
SELECT '3781', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Trâm', 'worker', 'active'
UNION ALL
SELECT '3782', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lầu Bá Giải', 'worker', 'active'
UNION ALL
SELECT '3783', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lầu Bá Chò', 'worker', 'active'
UNION ALL
SELECT '3784', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lù Văn Đạt', 'worker', 'active'
UNION ALL
SELECT '3787', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Phương Dung', 'worker', 'active'
UNION ALL
SELECT '3789', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Văn Toàn', 'worker', 'active'
UNION ALL
SELECT '3790', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Quách Công Sơn', 'worker', 'active'
UNION ALL
SELECT '3792', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'HÀ NGỌC DƯƠNG', 'worker', 'active'
UNION ALL
SELECT '3793', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÈ VĂN THÂN', 'worker', 'active'
UNION ALL
SELECT '3798', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Đỗ Hoài Thu', 'worker', 'active'
UNION ALL
SELECT '3799', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Văn Đồng', 'worker', 'active'
UNION ALL
SELECT '3800', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MONG THI HAI', 'worker', 'active'
UNION ALL
SELECT '3804', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'DINH VAN DUY', 'worker', 'active'
UNION ALL
SELECT '3832', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Tiến Khương', 'worker', 'active'
UNION ALL
SELECT '3834', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Văn Phan', 'worker', 'active'
UNION ALL
SELECT '3840', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Văn Huy', 'worker', 'active'
UNION ALL
SELECT '3842', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'VƯ BÁ CHÙA', 'worker', 'active'
UNION ALL
SELECT '3843', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vừ Bá Cu', 'worker', 'active'
UNION ALL
SELECT '3844', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Xồng Y Bầu', 'worker', 'active'
UNION ALL
SELECT '3854', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Văn Khải', 'worker', 'active'
UNION ALL
SELECT '3856', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'GIANG A SIA', 'worker', 'active'
UNION ALL
SELECT '3862', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Hà', 'worker', 'active'
UNION ALL
SELECT '3863', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Thị Lúa', 'worker', 'active'
UNION ALL
SELECT '3875', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Văn Kềnh', 'worker', 'active'
UNION ALL
SELECT '3888', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Xuân Bắc', 'worker', 'active'
UNION ALL
SELECT '3892', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Việt Hùng', 'worker', 'active'
UNION ALL
SELECT '3894', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'phương sxc', 'worker', 'active'
UNION ALL
SELECT '3899', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'XỒNG BÁ RÊ', 'worker', 'active'
UNION ALL
SELECT '3901', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lý Thị Bọng', 'worker', 'active'
UNION ALL
SELECT '3913', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thành Bảo Long', 'worker', 'active'
UNION ALL
SELECT '3919', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Văn Nhượng', 'worker', 'active'
UNION ALL
SELECT '3922', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Văn Hải', 'worker', 'active'
UNION ALL
SELECT '3929', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Quốc Anh', 'worker', 'active'
UNION ALL
SELECT '3930', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Hậu', 'worker', 'active'
UNION ALL
SELECT '3934', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'HO Y TONG', 'worker', 'active'
UNION ALL
SELECT '3935', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'LAU BA THAI', 'worker', 'active'
UNION ALL
SELECT '3936', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Phiện', 'worker', 'active'
UNION ALL
SELECT '3942', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Nhung', 'worker', 'active'
UNION ALL
SELECT '3959', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Văn Án', 'worker', 'active'
UNION ALL
SELECT '3960', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Quàng Thị Niên', 'worker', 'active'
UNION ALL
SELECT '3964', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Ma Văn Sinh', 'worker', 'active'
UNION ALL
SELECT '3968', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Hải Yến', 'worker', 'active'
UNION ALL
SELECT '3971', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Hoài Vinh', 'worker', 'active'
UNION ALL
SELECT '3973', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Hưng', 'worker', 'active'
UNION ALL
SELECT '3974', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Tuyết Oanh', 'worker', 'active'
UNION ALL
SELECT '3985', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Văn Đạt', 'worker', 'active'
UNION ALL
SELECT '3990', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Tâm', 'worker', 'active'
UNION ALL
SELECT '3991', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'LÒ VĂN VŨ', 'worker', 'active'
UNION ALL
SELECT '3996', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Nhinh', 'worker', 'active'
UNION ALL
SELECT '4', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Hoa', 'worker', 'active'
UNION ALL
SELECT '4013', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Thị Xuân', 'worker', 'active'
UNION ALL
SELECT '4017', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Nga', 'worker', 'active'
UNION ALL
SELECT '4019', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Văn Lưu', 'worker', 'active'
UNION ALL
SELECT '4024', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Văn Thanh', 'worker', 'active'
UNION ALL
SELECT '4031', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Hạnh', 'worker', 'active'
UNION ALL
SELECT '4032', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Mai Phượng', 'worker', 'active'
UNION ALL
SELECT '4033', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Loan', 'worker', 'active'
UNION ALL
SELECT '4039', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Thị Thủy', 'worker', 'active'
UNION ALL
SELECT '4041', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Phương Lan', 'worker', 'active'
UNION ALL
SELECT '4048', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Văn Sáng', 'worker', 'active'
UNION ALL
SELECT '4052', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Hoa', 'worker', 'active'
UNION ALL
SELECT '4058', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Văn Trường', 'worker', 'active'
UNION ALL
SELECT '4070', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Thị Minh Thư', 'worker', 'active'
UNION ALL
SELECT '4072', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Dương Văn Việt', 'worker', 'active'
UNION ALL
SELECT '4073', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lý A Cương', 'worker', 'active'
UNION ALL
SELECT '4076', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Hải Long', 'worker', 'active'
UNION ALL
SELECT '4079', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Cao Minh Tuấn', 'worker', 'active'
UNION ALL
SELECT '4081', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trương Thị Khu', 'worker', 'active'
UNION ALL
SELECT '4083', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Thị Hợp', 'worker', 'active'
UNION ALL
SELECT '4091', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Quốc Anh', 'worker', 'active'
UNION ALL
SELECT '4093', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Nguyên', 'worker', 'active'
UNION ALL
SELECT '4096', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Vứng', 'worker', 'active'
UNION ALL
SELECT '4097', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Thị Đóa', 'worker', 'active'
UNION ALL
SELECT '4102', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Ngọc Lan', 'worker', 'active'
UNION ALL
SELECT '4107', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Yến Nhi', 'worker', 'active'
UNION ALL
SELECT '4108', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÙI VĂN XUYÊN', 'worker', 'active'
UNION ALL
SELECT '4110', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Văn Huyên', 'worker', 'active'
UNION ALL
SELECT '4114', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nông Thị Thúy', 'worker', 'active'
UNION ALL
SELECT '4115', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Bá Anh Tuấn', 'worker', 'active'
UNION ALL
SELECT '4116', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Thị Hoa', 'worker', 'active'
UNION ALL
SELECT '4117', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Lam', 'worker', 'active'
UNION ALL
SELECT '4124', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Đỗ Minh Anh', 'worker', 'active'
UNION ALL
SELECT '4126', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Tống Thế Phong', 'worker', 'active'
UNION ALL
SELECT '4132', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Đức Thảo', 'worker', 'active'
UNION ALL
SELECT '4144', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÙI VĂN HÁNH', 'worker', 'active'
UNION ALL
SELECT '4150', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÙI VĂN VIÊN', 'worker', 'active'
UNION ALL
SELECT '4152', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Sùng Mí Mua', 'worker', 'active'
UNION ALL
SELECT '4155', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Quang Anh', 'worker', 'active'
UNION ALL
SELECT '416', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Thủy', 'worker', 'active'
UNION ALL
SELECT '4162', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Cà Thị Viết', 'worker', 'active'
UNION ALL
SELECT '4164', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vừ Y Bi', 'worker', 'active'
UNION ALL
SELECT '4166', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Tùng Dương', 'worker', 'active'
UNION ALL
SELECT '4167', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Văn Dũng', 'worker', 'active'
UNION ALL
SELECT '4169', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'QUACH VĂN HƯNG', 'worker', 'active'
UNION ALL
SELECT '4173', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Văn Thanh', 'worker', 'active'
UNION ALL
SELECT '4174', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Văn Phúc', 'worker', 'active'
UNION ALL
SELECT '4178', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'HÀ THỊ MÂY', 'worker', 'active'
UNION ALL
SELECT '4180', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'HÀ THỊ MIỀN', 'worker', 'active'
UNION ALL
SELECT '4181', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÙI THỊ HƯƠNG', 'worker', 'active'
UNION ALL
SELECT '4182', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'BÙI THỊ HÀO', 'worker', 'active'
UNION ALL
SELECT '4185', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vàng Văn Hạnh', 'worker', 'active'
UNION ALL
SELECT '4197', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Quách Thị Ninh', 'worker', 'active'
UNION ALL
SELECT '4199', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'TRỊNH THU HÀ', 'worker', 'active'
UNION ALL
SELECT '4201', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'SỒNG A CHA', 'worker', 'active'
UNION ALL
SELECT '4219', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bàn Thị Thu', 'worker', 'active'
UNION ALL
SELECT '4220', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lừ Thị Thảo', 'worker', 'active'
UNION ALL
SELECT '4230', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hương SX3', 'worker', 'active'
UNION ALL
SELECT '4232', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'SỒNG A THAÍ', 'worker', 'active'
UNION ALL
SELECT '4238', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Huy Thái', 'worker', 'active'
UNION ALL
SELECT '4241', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Văn Tuấn', 'worker', 'active'
UNION ALL
SELECT '4244', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÙI VĂN XUYÊN', 'worker', 'active'
UNION ALL
SELECT '4248', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Thùy Trang', 'worker', 'active'
UNION ALL
SELECT '4249', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Thị Anh Thư', 'worker', 'active'
UNION ALL
SELECT '4254', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Thị Yến Nhi', 'worker', 'active'
UNION ALL
SELECT '4257', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Công Tuyền', 'worker', 'active'
UNION ALL
SELECT '4260', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'SA ANH THÀNH', 'worker', 'active'
UNION ALL
SELECT '4269', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Thị Kiên', 'worker', 'active'
UNION ALL
SELECT '4271', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÙI VĂN SƯƠNG', 'worker', 'active'
UNION ALL
SELECT '4275', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phùng Minh Tuấn', 'worker', 'active'
) AS s
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), status='active' ;

INSERT INTO users (username, password, full_name, role, status)
SELECT s.username, s.password, s.full_name, 'worker', 'active'
FROM (
SELECT '4276' AS `username`, '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6' AS `password`, 'Phạm Thị Tam' AS `full_name`, 'worker' AS `role`, 'active' AS `status`
UNION ALL
SELECT '4277', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Ngọc Quỳnh', 'worker', 'active'
UNION ALL
SELECT '4278', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Minh Quốc', 'worker', 'active'
UNION ALL
SELECT '4279', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lưu Văn Khoa', 'worker', 'active'
UNION ALL
SELECT '4280', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Đinh Huyền Châm', 'worker', 'active'
UNION ALL
SELECT '4284', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Văn Quỳnh', 'worker', 'active'
UNION ALL
SELECT '4286', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'VÌ THỊ LOAN', 'worker', 'active'
UNION ALL
SELECT '4290', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bạc Văn Dũng', 'worker', 'active'
UNION ALL
SELECT '4291', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Hoài Nam', 'worker', 'active'
UNION ALL
SELECT '4293', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'QUÁCH VĂN NGUYÊN', 'worker', 'active'
UNION ALL
SELECT '4294', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'DUNG', 'worker', 'active'
UNION ALL
SELECT '4296', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Thị Mến', 'worker', 'active'
UNION ALL
SELECT '4301', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'NGẦN VĂN CHUYỂN', 'worker', 'active'
UNION ALL
SELECT '4307', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Trang', 'worker', 'active'
UNION ALL
SELECT '4313', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Hoa', 'worker', 'active'
UNION ALL
SELECT '4314', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Thị Thúy', 'worker', 'active'
UNION ALL
SELECT '4315', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'HÀ VĂN PHƯƠNG', 'worker', 'active'
UNION ALL
SELECT '4317', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nhâm CĐ', 'worker', 'active'
UNION ALL
SELECT '4318', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Tuấn CĐ', 'worker', 'active'
UNION ALL
SELECT '4323', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đào Thị Hường', 'worker', 'active'
UNION ALL
SELECT '4324', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Văn Lâm', 'worker', 'active'
UNION ALL
SELECT '4325', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nông Anh Tú', 'worker', 'active'
UNION ALL
SELECT '4326', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'VÌ VĂN THANH', 'worker', 'active'
UNION ALL
SELECT '4327', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đoàn Thu Hường', 'worker', 'active'
UNION ALL
SELECT '4328', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Dương Thị Bích Ngọc', 'worker', 'active'
UNION ALL
SELECT '4329', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Cẩm Tú', 'worker', 'active'
UNION ALL
SELECT '433', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'SÙNG A SÀO', 'worker', 'active'
UNION ALL
SELECT '4330', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'HÀ VIỆT BẮC', 'worker', 'active'
UNION ALL
SELECT '4331', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'ĐINH VĂN TOÀN', 'worker', 'active'
UNION ALL
SELECT '4332', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Đức Việt', 'worker', 'active'
UNION ALL
SELECT '4333', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Nhâm', 'worker', 'active'
UNION ALL
SELECT '4334', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Nhàn', 'worker', 'active'
UNION ALL
SELECT '4335', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Cầm Thị Viến', 'worker', 'active'
UNION ALL
SELECT '4338', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Thị Thoa', 'worker', 'active'
UNION ALL
SELECT '4340', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lầu Y Thủy', 'worker', 'active'
UNION ALL
SELECT '4341', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Thị Tâm', 'worker', 'active'
UNION ALL
SELECT '4342', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Văn Vặt', 'worker', 'active'
UNION ALL
SELECT '4343', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hậu QC', 'worker', 'active'
UNION ALL
SELECT '4344', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Văn Lâm', 'worker', 'active'
UNION ALL
SELECT '4345', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Vân Kiều', 'worker', 'active'
UNION ALL
SELECT '4346', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Anh Thế', 'worker', 'active'
UNION ALL
SELECT '4347', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÙA A VẠNG', 'worker', 'active'
UNION ALL
SELECT '4348', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'GIÀNG A MINH', 'worker', 'active'
UNION ALL
SELECT '4349', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'CHANG A VINH', 'worker', 'active'
UNION ALL
SELECT '435', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'LO VAN PHUC', 'worker', 'active'
UNION ALL
SELECT '4350', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'LÝ A HỒNG', 'worker', 'active'
UNION ALL
SELECT '4351', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Huệ', 'worker', 'active'
UNION ALL
SELECT '4352', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh THị Vân', 'worker', 'active'
UNION ALL
SELECT '4353', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Tòng Văn Cầm', 'worker', 'active'
UNION ALL
SELECT '4354', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'HÀ THẾ VINH', 'worker', 'active'
UNION ALL
SELECT '4355', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'GIÀNG A THÁI', 'worker', 'active'
UNION ALL
SELECT '4356', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'GIÀNG A HOA', 'worker', 'active'
UNION ALL
SELECT '4357', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'GIÀNG A DÊ', 'worker', 'active'
UNION ALL
SELECT '4360', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Xồng Y hiền', 'worker', 'active'
UNION ALL
SELECT '4361', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bàn Thị Thanh', 'worker', 'active'
UNION ALL
SELECT '4363', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MA A TRANG', 'worker', 'active'
UNION ALL
SELECT '4364', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lý Y Xư', 'worker', 'active'
UNION ALL
SELECT '4368', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lý Thị Hơi', 'worker', 'active'
UNION ALL
SELECT '4370', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lý A Cở', 'worker', 'active'
UNION ALL
SELECT '4373', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vàng A Chu', 'worker', 'active'
UNION ALL
SELECT '4374', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Sùng Thị Súa', 'worker', 'active'
UNION ALL
SELECT '465', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Thị Điệp', 'worker', 'active'
UNION ALL
SELECT '489', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Nhường', 'worker', 'active'
UNION ALL
SELECT '5', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Hải Nam', 'worker', 'active'
UNION ALL
SELECT '525', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Chương Văn Hôn', 'worker', 'active'
UNION ALL
SELECT '526', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Thị Thùy', 'worker', 'active'
UNION ALL
SELECT '551', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Thị Ngọc Diệp', 'worker', 'active'
UNION ALL
SELECT '560', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÙI THI LIÊN', 'worker', 'active'
UNION ALL
SELECT '561', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÙI THỊ LINH', 'worker', 'active'
UNION ALL
SELECT '562', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Tươi', 'worker', 'active'
UNION ALL
SELECT '582', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'LƯỜNG GIA HUY', 'worker', 'active'
UNION ALL
SELECT '590', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÙI VĂN ĐỊNH', 'worker', 'active'
UNION ALL
SELECT '591', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'ĐINH KHÁNH BẢO', 'worker', 'active'
UNION ALL
SELECT '599', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'An Thị Thanh Phương', 'worker', 'active'
UNION ALL
SELECT '602', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'LÒ VĂN NHIÊN', 'worker', 'active'
UNION ALL
SELECT '606', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÙA A PHANG', 'worker', 'active'
UNION ALL
SELECT '613', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phùng Viết Phượng', 'worker', 'active'
UNION ALL
SELECT '62', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Thế Vinh', 'worker', 'active'
UNION ALL
SELECT '625', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hứa Thị Thấm', 'worker', 'active'
UNION ALL
SELECT '63', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Nga', 'worker', 'active'
UNION ALL
SELECT '632', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Giàng A Vông', 'worker', 'active'
UNION ALL
SELECT '639', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Tâm Như', 'worker', 'active'
UNION ALL
SELECT '640', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Diệp', 'worker', 'active'
UNION ALL
SELECT '641', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Đoan', 'worker', 'active'
UNION ALL
SELECT '642', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Xuân Nam', 'worker', 'active'
UNION ALL
SELECT '643', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Phương', 'worker', 'active'
UNION ALL
SELECT '644', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Thị Ngọc Yến', 'worker', 'active'
UNION ALL
SELECT '646', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'LÒ THỊ DUYÊN', 'worker', 'active'
UNION ALL
SELECT '647', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Ngọc Tuyền', 'worker', 'active'
UNION ALL
SELECT '648', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Lê Mây', 'worker', 'active'
UNION ALL
SELECT '649', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Vy Oanh', 'worker', 'active'
UNION ALL
SELECT '651', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Anh Quyền', 'worker', 'active'
UNION ALL
SELECT '655', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Giàng Thị Đông', 'worker', 'active'
UNION ALL
SELECT '656', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vừ A Nánh', 'worker', 'active'
UNION ALL
SELECT '657', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Tuấn Kiệt', 'worker', 'active'
UNION ALL
SELECT '658', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Văn Đạt', 'worker', 'active'
UNION ALL
SELECT '659', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'SÙNG A PÓ', 'worker', 'active'
UNION ALL
SELECT '66', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Hưng', 'worker', 'active'
UNION ALL
SELECT '661', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Giàng Thị Pàng', 'worker', 'active'
UNION ALL
SELECT '666', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vàng Mười Phành', 'worker', 'active'
UNION ALL
SELECT '668', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vừ A Chiến', 'worker', 'active'
UNION ALL
SELECT '669', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vàng Thị Quỳnh Châu', 'worker', 'active'
UNION ALL
SELECT '67', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Thị Xuyên', 'worker', 'active'
UNION ALL
SELECT '670', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Giàng A Công', 'worker', 'active'
UNION ALL
SELECT '671', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Tròng THị La', 'worker', 'active'
UNION ALL
SELECT '672', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Duy Quân', 'worker', 'active'
UNION ALL
SELECT '673', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Gia Tuệ', 'worker', 'active'
UNION ALL
SELECT '674', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Trọng Quyền', 'worker', 'active'
UNION ALL
SELECT '675', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùa A Chu', 'worker', 'active'
UNION ALL
SELECT '676', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trương Thị Hòa', 'worker', 'active'
UNION ALL
SELECT '679', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Mừng', 'worker', 'active'
UNION ALL
SELECT '68', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Quyền', 'worker', 'active'
UNION ALL
SELECT '681', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Sùng Thị Cu', 'worker', 'active'
UNION ALL
SELECT '682', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hảng A Tình', 'worker', 'active'
UNION ALL
SELECT '684', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Minh Đức', 'worker', 'active'
UNION ALL
SELECT '685', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vì Văn Phùng', 'worker', 'active'
UNION ALL
SELECT '686', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Ngần Văn Vĩnh', 'worker', 'active'
UNION ALL
SELECT '71', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Nhung', 'worker', 'active'
UNION ALL
SELECT '72', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Ngần Thị Thảo', 'worker', 'active'
UNION ALL
SELECT '74', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Lý', 'worker', 'active'
UNION ALL
SELECT '748', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đào Thị Hường', 'worker', 'active'
UNION ALL
SELECT '761', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Giàng Mí Vư', 'worker', 'active'
UNION ALL
SELECT '762', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Sùng Thị Mua', 'worker', 'active'
UNION ALL
SELECT '763', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Giàng A Tuấn', 'worker', 'active'
UNION ALL
SELECT '764', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Giàng Mí Cho', 'worker', 'active'
UNION ALL
SELECT '765', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MUA MÍ SÙNG', 'worker', 'active'
UNION ALL
SELECT '766', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MUA MÍ SÍNH', 'worker', 'active'
UNION ALL
SELECT '800', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Thanh', 'worker', 'active'
UNION ALL
SELECT '82', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Đức Duy', 'worker', 'active'
UNION ALL
SELECT '83', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Cầm Tuấn Anh', 'worker', 'active'
UNION ALL
SELECT '909', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đặng Quang Trung', 'worker', 'active'
UNION ALL
SELECT '92', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Quốc Vui', 'worker', 'active'
UNION ALL
SELECT '93', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Hà Minh Khuê', 'worker', 'active'
UNION ALL
SELECT '94', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Thủy Lan', 'worker', 'active'
UNION ALL
SELECT '95', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Thị Lợi', 'worker', 'active'
UNION ALL
SELECT '958', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lục Văn Ngân', 'worker', 'active'
UNION ALL
SELECT '96', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phương Hiền Linh', 'worker', 'active'
UNION ALL
SELECT '97', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lữ Thành Đạt', 'worker', 'active'
UNION ALL
SELECT '98', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Mạnh Đình', 'worker', 'active'
UNION ALL
SELECT 'HS004', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Việt Anh', 'worker', 'active'
UNION ALL
SELECT 'HS025', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Đức Huy', 'worker', 'active'
UNION ALL
SELECT 'HS078', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Đức Việt', 'worker', 'active'
UNION ALL
SELECT 'HS081', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Duy Khánh', 'worker', 'active'
UNION ALL
SELECT 'K015', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'MÙI VĂN DỰC', 'worker', 'active'
UNION ALL
SELECT 'K091', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Trọng Mạnh', 'worker', 'active'
UNION ALL
SELECT 'K092', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vũ Thị Kha', 'worker', 'active'
UNION ALL
SELECT 'K100', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Hương Giang', 'worker', 'active'
UNION ALL
SELECT 'K101', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phùng Thị Phương Anh', 'worker', 'active'
UNION ALL
SELECT 'K102', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Minh Khôi', 'worker', 'active'
UNION ALL
SELECT 'K103', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Dương Bảo Ngọc', 'worker', 'active'
) AS s
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), status='active' ;

INSERT INTO users (username, password, full_name, role, status)
SELECT s.username, s.password, s.full_name, 'worker', 'active'
FROM (
SELECT 'P599' AS `username`, '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6' AS `password`, 'An Thị Thanh Phương' AS `full_name`, 'worker' AS `role`, 'active' AS `status`
UNION ALL
SELECT 'V2278', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Sa Thị Ương', 'worker', 'active'
UNION ALL
SELECT 'V748', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'ĐÀO THỊ HƯỜNG', 'worker', 'active'
UNION ALL
SELECT 'VH10-158', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Hà Phương', 'worker', 'active'
UNION ALL
SELECT 'VH7-010', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trịnh Văn Dũng', 'worker', 'active'
UNION ALL
SELECT 'VH7-012', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Khắc Đạt', 'worker', 'active'
UNION ALL
SELECT 'VH7-019', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Anh Kiệt', 'worker', 'active'
UNION ALL
SELECT 'VH7-027', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Vương Phi', 'worker', 'active'
UNION ALL
SELECT 'VH7-028', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Nhật Phong', 'worker', 'active'
UNION ALL
SELECT 'VH8-067', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Ngọc Bảo Hân', 'worker', 'active'
UNION ALL
SELECT 'VH8-162', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Khánh Vy', 'worker', 'active'
UNION ALL
SELECT 'VH8-43', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vũ Giáp Ngọc Bảo', 'worker', 'active'
UNION ALL
SELECT 'VH8-44', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Diệp Chi', 'worker', 'active'
UNION ALL
SELECT 'VH8-48', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thùy Linh', 'worker', 'active'
UNION ALL
SELECT 'VH8-49', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Nhã Linh', 'worker', 'active'
UNION ALL
SELECT 'VH8-52', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Anh Vũ', 'worker', 'active'
UNION ALL
SELECT 'VH8-53', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Phương Vy', 'worker', 'active'
UNION ALL
SELECT 'VH8-56', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đoàn Lan Anh', 'worker', 'active'
UNION ALL
SELECT 'VH8-58', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Vân Anh', 'worker', 'active'
UNION ALL
SELECT 'VH8-63', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Trọng Đại', 'worker', 'active'
UNION ALL
SELECT 'VH8-70', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Quang Khải', 'worker', 'active'
UNION ALL
SELECT 'VH8-73', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Mai Y Linh', 'worker', 'active'
UNION ALL
SELECT 'VH8-81', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Kỳ Phụng', 'worker', 'active'
UNION ALL
SELECT 'VH9-090', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Trang Anh', 'worker', 'active'
UNION ALL
SELECT 'VH9-091', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Ngọc Hà', 'worker', 'active'
UNION ALL
SELECT 'VH9-099', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Tống Khánh Ly', 'worker', 'active'
UNION ALL
SELECT 'VH9-100', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Khánh Ly', 'worker', 'active'
UNION ALL
SELECT 'VH9-103', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Quyền Thu Tâm', 'worker', 'active'
UNION ALL
SELECT 'VH9-104', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Phương Thảo', 'worker', 'active'
UNION ALL
SELECT 'VH9-105', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trương Thị Anh Thư', 'worker', 'active'
UNION ALL
SELECT 'VH9-107', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Huyền Trang', 'worker', 'active'
UNION ALL
SELECT 'VH9-111', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Phương Anh', 'worker', 'active'
UNION ALL
SELECT 'VH9-112', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Xuân Anh', 'worker', 'active'
UNION ALL
SELECT 'VH9-123', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Như Quỳnh', 'worker', 'active'
UNION ALL
SELECT 'VH9-124', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trương Anh Thư -sxc', 'worker', 'active'
UNION ALL
SELECT 'VH9-93', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Hà Minh Khuê-SXC', 'worker', 'active'
UNION ALL
SELECT 'h101', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Duy Minh -101', 'worker', 'active'
UNION ALL
SELECT 'h110', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Việt Anh -110', 'worker', 'active'
UNION ALL
SELECT 'h114', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Gia Bách -114', 'worker', 'active'
UNION ALL
SELECT 'h116', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Hoàng Hải -116', 'worker', 'active'
UNION ALL
SELECT 'h117', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đặng Sơn Hải -117', 'worker', 'active'
UNION ALL
SELECT 'h118', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vũ Đức Khánh -118', 'worker', 'active'
UNION ALL
SELECT 'h120', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Trí Long -120', 'worker', 'active'
UNION ALL
SELECT 'h121', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Bảo Minh -121', 'worker', 'active'
UNION ALL
SELECT 'h122', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vũ Hữu Quân -122', 'worker', 'active'
UNION ALL
SELECT 'h22', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hà Đức Minh -22', 'worker', 'active'
UNION ALL
SELECT 'h23', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thế Minh -23', 'worker', 'active'
UNION ALL
SELECT 'h30', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thiệu Quang -30', 'worker', 'active'
UNION ALL
SELECT 'h31', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Minh Sơn -31', 'worker', 'active'
UNION ALL
SELECT 'h36', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Minh Triết -36', 'worker', 'active'
UNION ALL
SELECT 'h37', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Duy Việt -37', 'worker', 'active'
UNION ALL
SELECT 'h41', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đặng Hải Yến -41', 'worker', 'active'
UNION ALL
SELECT 'h42', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Khánh Linh -42', 'worker', 'active'
UNION ALL
SELECT 'h7', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Gia Bảo -7', 'worker', 'active'
UNION ALL
SELECT 'hs002', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Dương Tuấn Anh', 'worker', 'active'
UNION ALL
SELECT 'hs003', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phan Đình Quang Anh', 'worker', 'active'
UNION ALL
SELECT 'hs006', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Tiến Bách', 'worker', 'active'
UNION ALL
SELECT 'hs008', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đặng Gia Bình', 'worker', 'active'
UNION ALL
SELECT 'hs009', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thành Công', 'worker', 'active'
UNION ALL
SELECT 'hs014', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Minh Đức', 'worker', 'active'
UNION ALL
SELECT 'hs015', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Gia Hiển', 'worker', 'active'
UNION ALL
SELECT 'hs017', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'La Quốc Hưng', 'worker', 'active'
UNION ALL
SELECT 'hs018', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Gia Huy', 'worker', 'active'
UNION ALL
SELECT 'hs021', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Quang Minh', 'worker', 'active'
UNION ALL
SELECT 'hs024', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Hải Nam', 'worker', 'active'
UNION ALL
SELECT 'hs026', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thành Phát', 'worker', 'active'
UNION ALL
SELECT 'hs033', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Phan Đức Thành', 'worker', 'active'
UNION ALL
SELECT 'hs034', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đồng Phúc Thịnh', 'worker', 'active'
UNION ALL
SELECT 'hs038', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Quốc Việt', 'worker', 'active'
UNION ALL
SELECT 'hs046', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Nguyễn Gia Hân', 'worker', 'active'
UNION ALL
SELECT 'hs054', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Khánh An', 'worker', 'active'
UNION ALL
SELECT 'hs057', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Lưu Bảo Anh', 'worker', 'active'
UNION ALL
SELECT 'hs061', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Ngọc Bảo', 'worker', 'active'
UNION ALL
SELECT 'hs062', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Ngọc Diệp', 'worker', 'active'
UNION ALL
SELECT 'hs074', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Bảo Linh', 'worker', 'active'
UNION ALL
SELECT 'hs076', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Hà My', 'worker', 'active'
UNION ALL
SELECT 'hs077', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Đặng Linh Nga', 'worker', 'active'
UNION ALL
SELECT 'hs079', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vũ Minh Ngọc', 'worker', 'active'
UNION ALL
SELECT 'hs083', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Anh Quân', 'worker', 'active'
UNION ALL
SELECT 'hs085', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Minh Thư', 'worker', 'active'
UNION ALL
SELECT 'hs097', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Huyền Linh', 'worker', 'active'
UNION ALL
SELECT 'hs098', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Gia Linh', 'worker', 'active'
UNION ALL
SELECT 'hs113', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Phương Anh', 'worker', 'active'
UNION ALL
SELECT 'hs115', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hồ Dạ Minh Châu', 'worker', 'active'
UNION ALL
SELECT 'hs125', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Minh Thuận', 'worker', 'active'
UNION ALL
SELECT 'hs126', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lương Thùy Trang', 'worker', 'active'
UNION ALL
SELECT 'hs127', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Quỳnh Anh', 'worker', 'active'
UNION ALL
SELECT 'hs129', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vũ Hương Giang', 'worker', 'active'
UNION ALL
SELECT 'hs130', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Chu Vũ tường Linh', 'worker', 'active'
UNION ALL
SELECT 'hs134', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thanh Tâm', 'worker', 'active'
UNION ALL
SELECT 'hs135', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Phương Trang', 'worker', 'active'
UNION ALL
SELECT 'hs137', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đặng Minh Anh', 'worker', 'active'
UNION ALL
SELECT 'hs138', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đào Hoàng Trang Anh', 'worker', 'active'
UNION ALL
SELECT 'hs141', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'M.Anh SX1', 'worker', 'active'
UNION ALL
SELECT 'hs145', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Linh Chi', 'worker', 'active'
UNION ALL
SELECT 'hs146', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Thùy Dương - Kiểm 1', 'worker', 'active'
UNION ALL
SELECT 'hs151', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thùy Linh', 'worker', 'active'
UNION ALL
SELECT 'hs156', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Minh Ngọc', 'worker', 'active'
UNION ALL
SELECT 'k010', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Bảo Ngân - 10', 'worker', 'active'
UNION ALL
SELECT 'k104', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thùy Trang', 'worker', 'active'
UNION ALL
SELECT 'k133', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Bảo Nhi - 133', 'worker', 'active'
UNION ALL
SELECT 'k136', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vũ Huyền Trang - 136', 'worker', 'active'
UNION ALL
SELECT 'k139', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Ngọc Anh - 139', 'worker', 'active'
UNION ALL
SELECT 'k144', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Bảo Châu - 144', 'worker', 'active'
UNION ALL
SELECT 'k148', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Thị Thanh Huyền - 148', 'worker', 'active'
UNION ALL
SELECT 'k149', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Thu Huyền - 149', 'worker', 'active'
UNION ALL
SELECT 'k155', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Bảo Ngân-155', 'worker', 'active'
UNION ALL
SELECT 'k157', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vương Thảo Nhi - 157', 'worker', 'active'
UNION ALL
SELECT 'k160', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bạch Nhữ Uyển Vy - 160', 'worker', 'active'
UNION ALL
SELECT 'k164', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Ngô Phương Linh - 164', 'worker', 'active'
UNION ALL
SELECT 'k45', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Ánh Dương - 45', 'worker', 'active'
UNION ALL
SELECT 'k46', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Bùi Nguyễn Gia Hân - 46', 'worker', 'active'
UNION ALL
SELECT 'k47', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Minh Hòa - 47', 'worker', 'active'
UNION ALL
SELECT 'k50', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Hoàng KHánh Ngọc - 50', 'worker', 'active'
UNION ALL
SELECT 'k64', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lại Việt Đức - 64', 'worker', 'active'
UNION ALL
SELECT 'k66', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mai Thanh Hà-66', 'worker', 'active'
UNION ALL
SELECT 'k68', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Vũ Sử Khánh Hưng - 68', 'worker', 'active'
UNION ALL
SELECT 'k69', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Nhật Hương - 69', 'worker', 'active'
UNION ALL
SELECT 'k71', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Hữu Minh Khang - 71', 'worker', 'active'
UNION ALL
SELECT 'k72', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Đức Khiêm - 72', 'worker', 'active'
UNION ALL
SELECT 'k74', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Bảo Linh - 74', 'worker', 'active'
UNION ALL
SELECT 'k78', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Đại Nghĩa - 78', 'worker', 'active'
UNION ALL
SELECT 'k80', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Đan Nhi - 80', 'worker', 'active'
UNION ALL
SELECT 'k82', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm VŨ Phương - 82', 'worker', 'active'
UNION ALL
SELECT 'k84', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Thành Sơn - 84', 'worker', 'active'
UNION ALL
SELECT 'k87', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Lan Vy - 87', 'worker', 'active'
UNION ALL
SELECT 't-551', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Mùi Thị Ngọc Diệp', 'worker', 'active'
UNION ALL
SELECT 'v1134', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Thủy', 'worker', 'active'
UNION ALL
SELECT 'v1333', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Hoàng Thị Thư', 'worker', 'active'
UNION ALL
SELECT 'v1448', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lê Thị Dung', 'worker', 'active'
UNION ALL
SELECT 'v1572', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Trần Thị Diên', 'worker', 'active'
UNION ALL
SELECT 'v2284', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Mư', 'worker', 'active'
UNION ALL
SELECT 'v2564', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Phương Thảo', 'worker', 'active'
UNION ALL
SELECT 'v2984', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lò Thị Uyên', 'worker', 'active'
UNION ALL
SELECT 'v3046', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Giang Thị Mậu', 'worker', 'active'
UNION ALL
SELECT 'v3263', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Thị Lan Hương', 'worker', 'active'
UNION ALL
SELECT 'v3351', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đinh Thị Hà', 'worker', 'active'
UNION ALL
SELECT 'v3607', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Tô Thị Thao', 'worker', 'active'
UNION ALL
SELECT 'v3622', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Thị Ngân', 'worker', 'active'
UNION ALL
SELECT 'v3971', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Hoàng Vinh', 'worker', 'active'
UNION ALL
SELECT 'v4083', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Phạm Thị Hợp', 'worker', 'active'
UNION ALL
SELECT 'v416', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Nguyễn Thị Thủy', 'worker', 'active'
UNION ALL
SELECT 'v4162', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Cà Thị Viết', 'worker', 'active'
) AS s
ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), status='active' ;

-- ============================================================================
-- 9. HỒ SƠ CÔNG NHÂN
-- ============================================================================
INSERT INTO workers (user_id, worker_code, department, position, training_percent, status)
SELECT u.id, s.worker_code, 'Sản xuất', 'Công nhân', COALESCE(s.training_percent,100), 'active'
FROM (
SELECT '1' AS `worker_code`, 100 AS `training_percent`, 'active' AS `status`
UNION ALL
SELECT '100', 100, 'active'
UNION ALL
SELECT '1007', 100, 'active'
UNION ALL
SELECT '1010', 100, 'active'
UNION ALL
SELECT '102', 100, 'active'
UNION ALL
SELECT '1020', 100, 'active'
UNION ALL
SELECT '104', 100, 'active'
UNION ALL
SELECT '107', 100, 'active'
UNION ALL
SELECT '108', 100, 'active'
UNION ALL
SELECT '109', 100, 'active'
UNION ALL
SELECT '1094', 100, 'active'
UNION ALL
SELECT '110', 100, 'active'
UNION ALL
SELECT '111', 100, 'active'
UNION ALL
SELECT '112', 100, 'active'
UNION ALL
SELECT '113', 100, 'active'
UNION ALL
SELECT '1134', 100, 'active'
UNION ALL
SELECT '117', 100, 'active'
UNION ALL
SELECT '118', 100, 'active'
UNION ALL
SELECT '124', 100, 'active'
UNION ALL
SELECT '1246', 100, 'active'
UNION ALL
SELECT '1253', 100, 'active'
UNION ALL
SELECT '126', 100, 'active'
UNION ALL
SELECT '13', 100, 'active'
UNION ALL
SELECT '1328', 100, 'active'
UNION ALL
SELECT '1333', 100, 'active'
UNION ALL
SELECT '1369', 100, 'active'
UNION ALL
SELECT '140', 100, 'active'
UNION ALL
SELECT '141', 100, 'active'
UNION ALL
SELECT '1443', 100, 'active'
UNION ALL
SELECT '1445', 100, 'active'
UNION ALL
SELECT '1446', 100, 'active'
UNION ALL
SELECT '1448', 100, 'active'
UNION ALL
SELECT '146', 100, 'active'
UNION ALL
SELECT '1476', 100, 'active'
UNION ALL
SELECT '1493', 100, 'active'
UNION ALL
SELECT '152', 100, 'active'
UNION ALL
SELECT '153', 100, 'active'
UNION ALL
SELECT '1541', 100, 'active'
UNION ALL
SELECT '1562', 100, 'active'
UNION ALL
SELECT '1571', 100, 'active'
UNION ALL
SELECT '1572', 100, 'active'
UNION ALL
SELECT '159', 100, 'active'
UNION ALL
SELECT '1594', 100, 'active'
UNION ALL
SELECT '1610', 100, 'active'
UNION ALL
SELECT '1643', 100, 'active'
UNION ALL
SELECT '1656', 100, 'active'
UNION ALL
SELECT '1677', 100, 'active'
UNION ALL
SELECT '1700', 100, 'active'
UNION ALL
SELECT '1733', 100, 'active'
UNION ALL
SELECT '1777', 100, 'active'
UNION ALL
SELECT '1845', 100, 'active'
UNION ALL
SELECT '1850', 100, 'active'
UNION ALL
SELECT '1933', 100, 'active'
UNION ALL
SELECT '1963', 100, 'active'
UNION ALL
SELECT '2', 100, 'active'
UNION ALL
SELECT '2009', 100, 'active'
UNION ALL
SELECT '2010', 100, 'active'
UNION ALL
SELECT '2030', 100, 'active'
UNION ALL
SELECT '2210', 100, 'active'
UNION ALL
SELECT '2278', 100, 'active'
UNION ALL
SELECT '2284', 100, 'active'
UNION ALL
SELECT '2327', 100, 'active'
UNION ALL
SELECT '2374', 100, 'active'
UNION ALL
SELECT '2399', 100, 'active'
UNION ALL
SELECT '2461', 100, 'active'
UNION ALL
SELECT '2488', 100, 'active'
UNION ALL
SELECT '25', 100, 'active'
UNION ALL
SELECT '2516', 100, 'active'
UNION ALL
SELECT '2545', 100, 'active'
UNION ALL
SELECT '2564', 100, 'active'
UNION ALL
SELECT '2625', 100, 'active'
UNION ALL
SELECT '2631', 100, 'active'
UNION ALL
SELECT '2643', 100, 'active'
UNION ALL
SELECT '2649', 100, 'active'
UNION ALL
SELECT '2747', 100, 'active'
UNION ALL
SELECT '2756', 100, 'active'
UNION ALL
SELECT '2763', 100, 'active'
UNION ALL
SELECT '2794', 100, 'active'
UNION ALL
SELECT '2798', 100, 'active'
UNION ALL
SELECT '2804', 100, 'active'
UNION ALL
SELECT '2837', 100, 'active'
UNION ALL
SELECT '2849', 100, 'active'
UNION ALL
SELECT '2851', 100, 'active'
UNION ALL
SELECT '2856', 100, 'active'
UNION ALL
SELECT '2865', 100, 'active'
UNION ALL
SELECT '2866', 100, 'active'
UNION ALL
SELECT '2890', 100, 'active'
UNION ALL
SELECT '2895', 100, 'active'
UNION ALL
SELECT '2938', 100, 'active'
UNION ALL
SELECT '2959', 100, 'active'
UNION ALL
SELECT '2960', 100, 'active'
UNION ALL
SELECT '2984', 100, 'active'
UNION ALL
SELECT '3', 100, 'active'
UNION ALL
SELECT '3037', 100, 'active'
UNION ALL
SELECT '3046', 100, 'active'
UNION ALL
SELECT '3111', 100, 'active'
UNION ALL
SELECT '3123', 100, 'active'
UNION ALL
SELECT '3130', 100, 'active'
UNION ALL
SELECT '3135', 100, 'active'
UNION ALL
SELECT '3171', 100, 'active'
UNION ALL
SELECT '3187', 100, 'active'
UNION ALL
SELECT '3234', 100, 'active'
UNION ALL
SELECT '3244', 100, 'active'
UNION ALL
SELECT '3258', 100, 'active'
UNION ALL
SELECT '3263', 100, 'active'
UNION ALL
SELECT '3268', 100, 'active'
UNION ALL
SELECT '3277', 100, 'active'
UNION ALL
SELECT '3289', 100, 'active'
UNION ALL
SELECT '3292', 100, 'active'
UNION ALL
SELECT '3293', 100, 'active'
UNION ALL
SELECT '3295', 100, 'active'
UNION ALL
SELECT '3300', 100, 'active'
UNION ALL
SELECT '3302', 100, 'active'
UNION ALL
SELECT '3303', 100, 'active'
UNION ALL
SELECT '3304', 100, 'active'
UNION ALL
SELECT '3305', 100, 'active'
UNION ALL
SELECT '3321', 100, 'active'
UNION ALL
SELECT '3324', 100, 'active'
UNION ALL
SELECT '3337', 100, 'active'
UNION ALL
SELECT '3343', 100, 'active'
UNION ALL
SELECT '3349', 100, 'active'
UNION ALL
SELECT '3351', 100, 'active'
UNION ALL
SELECT '3352', 100, 'active'
UNION ALL
SELECT '3353', 100, 'active'
UNION ALL
SELECT '3371', 100, 'active'
UNION ALL
SELECT '3372', 100, 'active'
UNION ALL
SELECT '3377', 100, 'active'
UNION ALL
SELECT '3379', 100, 'active'
UNION ALL
SELECT '3380', 100, 'active'
UNION ALL
SELECT '3388', 100, 'active'
UNION ALL
SELECT '3390', 100, 'active'
UNION ALL
SELECT '3394', 100, 'active'
UNION ALL
SELECT '3398', 100, 'active'
UNION ALL
SELECT '3414', 100, 'active'
UNION ALL
SELECT '342', 100, 'active'
UNION ALL
SELECT '3421', 100, 'active'
UNION ALL
SELECT '3456', 100, 'active'
UNION ALL
SELECT '3499', 100, 'active'
UNION ALL
SELECT '352', 100, 'active'
UNION ALL
SELECT '3526', 100, 'active'
UNION ALL
SELECT '3567', 100, 'active'
UNION ALL
SELECT '357', 100, 'active'
UNION ALL
SELECT '3571', 100, 'active'
UNION ALL
SELECT '3588', 100, 'active'
UNION ALL
SELECT '3590', 100, 'active'
UNION ALL
SELECT '3605', 100, 'active'
UNION ALL
SELECT '3606', 100, 'active'
UNION ALL
SELECT '3607', 100, 'active'
UNION ALL
SELECT '3617', 100, 'active'
UNION ALL
SELECT '3619', 100, 'active'
) AS s
JOIN users u ON u.username=s.worker_code
ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), training_percent=VALUES(training_percent), status='active' ;

INSERT INTO workers (user_id, worker_code, department, position, training_percent, status)
SELECT u.id, s.worker_code, 'Sản xuất', 'Công nhân', COALESCE(s.training_percent,100), 'active'
FROM (
SELECT '3622' AS `worker_code`, 100 AS `training_percent`, 'active' AS `status`
UNION ALL
SELECT '3626', 100, 'active'
UNION ALL
SELECT '3632', 100, 'active'
UNION ALL
SELECT '3637', 100, 'active'
UNION ALL
SELECT '3638', 100, 'active'
UNION ALL
SELECT '3645', 100, 'active'
UNION ALL
SELECT '3648', 100, 'active'
UNION ALL
SELECT '3650', 100, 'active'
UNION ALL
SELECT '3653', 100, 'active'
UNION ALL
SELECT '3668', 100, 'active'
UNION ALL
SELECT '3671', 100, 'active'
UNION ALL
SELECT '3673', 100, 'active'
UNION ALL
SELECT '3675', 100, 'active'
UNION ALL
SELECT '3693', 100, 'active'
UNION ALL
SELECT '3694', 100, 'active'
UNION ALL
SELECT '3695', 100, 'active'
UNION ALL
SELECT '3712', 100, 'active'
UNION ALL
SELECT '3713', 100, 'active'
UNION ALL
SELECT '3715', 100, 'active'
UNION ALL
SELECT '3743', 100, 'active'
UNION ALL
SELECT '3745', 100, 'active'
UNION ALL
SELECT '3751', 100, 'active'
UNION ALL
SELECT '3752', 100, 'active'
UNION ALL
SELECT '3758', 100, 'active'
UNION ALL
SELECT '3759', 100, 'active'
UNION ALL
SELECT '376', 100, 'active'
UNION ALL
SELECT '3766', 100, 'active'
UNION ALL
SELECT '3769', 100, 'active'
UNION ALL
SELECT '3771', 100, 'active'
UNION ALL
SELECT '3772', 100, 'active'
UNION ALL
SELECT '3779', 100, 'active'
UNION ALL
SELECT '3781', 100, 'active'
UNION ALL
SELECT '3782', 100, 'active'
UNION ALL
SELECT '3783', 100, 'active'
UNION ALL
SELECT '3784', 100, 'active'
UNION ALL
SELECT '3787', 100, 'active'
UNION ALL
SELECT '3789', 100, 'active'
UNION ALL
SELECT '3790', 100, 'active'
UNION ALL
SELECT '3792', 100, 'active'
UNION ALL
SELECT '3793', 100, 'active'
UNION ALL
SELECT '3798', 100, 'active'
UNION ALL
SELECT '3799', 100, 'active'
UNION ALL
SELECT '3800', 100, 'active'
UNION ALL
SELECT '3804', 100, 'active'
UNION ALL
SELECT '3832', 100, 'active'
UNION ALL
SELECT '3834', 100, 'active'
UNION ALL
SELECT '3840', 100, 'active'
UNION ALL
SELECT '3842', 100, 'active'
UNION ALL
SELECT '3843', 100, 'active'
UNION ALL
SELECT '3844', 100, 'active'
UNION ALL
SELECT '3854', 100, 'active'
UNION ALL
SELECT '3856', 100, 'active'
UNION ALL
SELECT '3862', 100, 'active'
UNION ALL
SELECT '3863', 100, 'active'
UNION ALL
SELECT '3875', 100, 'active'
UNION ALL
SELECT '3888', 100, 'active'
UNION ALL
SELECT '3892', 100, 'active'
UNION ALL
SELECT '3894', 100, 'active'
UNION ALL
SELECT '3899', 100, 'active'
UNION ALL
SELECT '3901', 100, 'active'
UNION ALL
SELECT '3913', 100, 'active'
UNION ALL
SELECT '3919', 100, 'active'
UNION ALL
SELECT '3922', 100, 'active'
UNION ALL
SELECT '3929', 100, 'active'
UNION ALL
SELECT '3930', 100, 'active'
UNION ALL
SELECT '3934', 100, 'active'
UNION ALL
SELECT '3935', 100, 'active'
UNION ALL
SELECT '3936', 100, 'active'
UNION ALL
SELECT '3942', 100, 'active'
UNION ALL
SELECT '3959', 100, 'active'
UNION ALL
SELECT '3960', 100, 'active'
UNION ALL
SELECT '3964', 100, 'active'
UNION ALL
SELECT '3968', 100, 'active'
UNION ALL
SELECT '3971', 100, 'active'
UNION ALL
SELECT '3973', 100, 'active'
UNION ALL
SELECT '3974', 100, 'active'
UNION ALL
SELECT '3985', 100, 'active'
UNION ALL
SELECT '3990', 100, 'active'
UNION ALL
SELECT '3991', 100, 'active'
UNION ALL
SELECT '3996', 100, 'active'
UNION ALL
SELECT '4', 100, 'active'
UNION ALL
SELECT '4013', 100, 'active'
UNION ALL
SELECT '4017', 100, 'active'
UNION ALL
SELECT '4019', 100, 'active'
UNION ALL
SELECT '4024', 100, 'active'
UNION ALL
SELECT '4031', 100, 'active'
UNION ALL
SELECT '4032', 100, 'active'
UNION ALL
SELECT '4033', 100, 'active'
UNION ALL
SELECT '4039', 100, 'active'
UNION ALL
SELECT '4041', 100, 'active'
UNION ALL
SELECT '4048', 100, 'active'
UNION ALL
SELECT '4052', 100, 'active'
UNION ALL
SELECT '4058', 100, 'active'
UNION ALL
SELECT '4070', 100, 'active'
UNION ALL
SELECT '4072', 100, 'active'
UNION ALL
SELECT '4073', 100, 'active'
UNION ALL
SELECT '4076', 100, 'active'
UNION ALL
SELECT '4079', 100, 'active'
UNION ALL
SELECT '4081', 100, 'active'
UNION ALL
SELECT '4083', 100, 'active'
UNION ALL
SELECT '4091', 100, 'active'
UNION ALL
SELECT '4093', 100, 'active'
UNION ALL
SELECT '4096', 100, 'active'
UNION ALL
SELECT '4097', 100, 'active'
UNION ALL
SELECT '4102', 100, 'active'
UNION ALL
SELECT '4107', 100, 'active'
UNION ALL
SELECT '4108', 100, 'active'
UNION ALL
SELECT '4110', 100, 'active'
UNION ALL
SELECT '4114', 100, 'active'
UNION ALL
SELECT '4115', 100, 'active'
UNION ALL
SELECT '4116', 100, 'active'
UNION ALL
SELECT '4117', 100, 'active'
UNION ALL
SELECT '4124', 100, 'active'
UNION ALL
SELECT '4126', 100, 'active'
UNION ALL
SELECT '4132', 100, 'active'
UNION ALL
SELECT '4144', 100, 'active'
UNION ALL
SELECT '4150', 100, 'active'
UNION ALL
SELECT '4152', 100, 'active'
UNION ALL
SELECT '4155', 100, 'active'
UNION ALL
SELECT '416', 100, 'active'
UNION ALL
SELECT '4162', 100, 'active'
UNION ALL
SELECT '4164', 100, 'active'
UNION ALL
SELECT '4166', 100, 'active'
UNION ALL
SELECT '4167', 100, 'active'
UNION ALL
SELECT '4169', 100, 'active'
UNION ALL
SELECT '4173', 100, 'active'
UNION ALL
SELECT '4174', 100, 'active'
UNION ALL
SELECT '4178', 100, 'active'
UNION ALL
SELECT '4180', 100, 'active'
UNION ALL
SELECT '4181', 100, 'active'
UNION ALL
SELECT '4182', 100, 'active'
UNION ALL
SELECT '4185', 100, 'active'
UNION ALL
SELECT '4197', 100, 'active'
UNION ALL
SELECT '4199', 100, 'active'
UNION ALL
SELECT '4201', 100, 'active'
UNION ALL
SELECT '4219', 100, 'active'
UNION ALL
SELECT '4220', 100, 'active'
UNION ALL
SELECT '4230', 100, 'active'
UNION ALL
SELECT '4232', 100, 'active'
UNION ALL
SELECT '4238', 100, 'active'
UNION ALL
SELECT '4241', 100, 'active'
UNION ALL
SELECT '4244', 100, 'active'
UNION ALL
SELECT '4248', 100, 'active'
UNION ALL
SELECT '4249', 100, 'active'
UNION ALL
SELECT '4254', 100, 'active'
UNION ALL
SELECT '4257', 100, 'active'
UNION ALL
SELECT '4260', 100, 'active'
UNION ALL
SELECT '4269', 100, 'active'
UNION ALL
SELECT '4271', 100, 'active'
UNION ALL
SELECT '4275', 100, 'active'
) AS s
JOIN users u ON u.username=s.worker_code
ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), training_percent=VALUES(training_percent), status='active' ;

INSERT INTO workers (user_id, worker_code, department, position, training_percent, status)
SELECT u.id, s.worker_code, 'Sản xuất', 'Công nhân', COALESCE(s.training_percent,100), 'active'
FROM (
SELECT '4276' AS `worker_code`, 100 AS `training_percent`, 'active' AS `status`
UNION ALL
SELECT '4277', 100, 'active'
UNION ALL
SELECT '4278', 100, 'active'
UNION ALL
SELECT '4279', 100, 'active'
UNION ALL
SELECT '4280', 100, 'active'
UNION ALL
SELECT '4284', 100, 'active'
UNION ALL
SELECT '4286', 100, 'active'
UNION ALL
SELECT '4290', 100, 'active'
UNION ALL
SELECT '4291', 100, 'active'
UNION ALL
SELECT '4293', 100, 'active'
UNION ALL
SELECT '4294', 100, 'active'
UNION ALL
SELECT '4296', 100, 'active'
UNION ALL
SELECT '4301', 100, 'active'
UNION ALL
SELECT '4307', 100, 'active'
UNION ALL
SELECT '4313', 100, 'active'
UNION ALL
SELECT '4314', 100, 'active'
UNION ALL
SELECT '4315', 100, 'active'
UNION ALL
SELECT '4317', 100, 'active'
UNION ALL
SELECT '4318', 100, 'active'
UNION ALL
SELECT '4323', 100, 'active'
UNION ALL
SELECT '4324', 100, 'active'
UNION ALL
SELECT '4325', 100, 'active'
UNION ALL
SELECT '4326', 100, 'active'
UNION ALL
SELECT '4327', 100, 'active'
UNION ALL
SELECT '4328', 100, 'active'
UNION ALL
SELECT '4329', 100, 'active'
UNION ALL
SELECT '433', 100, 'active'
UNION ALL
SELECT '4330', 100, 'active'
UNION ALL
SELECT '4331', 100, 'active'
UNION ALL
SELECT '4332', 100, 'active'
UNION ALL
SELECT '4333', 100, 'active'
UNION ALL
SELECT '4334', 100, 'active'
UNION ALL
SELECT '4335', 100, 'active'
UNION ALL
SELECT '4338', 100, 'active'
UNION ALL
SELECT '4340', 100, 'active'
UNION ALL
SELECT '4341', 100, 'active'
UNION ALL
SELECT '4342', 100, 'active'
UNION ALL
SELECT '4343', 100, 'active'
UNION ALL
SELECT '4344', 100, 'active'
UNION ALL
SELECT '4345', 100, 'active'
UNION ALL
SELECT '4346', 100, 'active'
UNION ALL
SELECT '4347', 100, 'active'
UNION ALL
SELECT '4348', 100, 'active'
UNION ALL
SELECT '4349', 100, 'active'
UNION ALL
SELECT '435', 100, 'active'
UNION ALL
SELECT '4350', 100, 'active'
UNION ALL
SELECT '4351', 100, 'active'
UNION ALL
SELECT '4352', 100, 'active'
UNION ALL
SELECT '4353', 100, 'active'
UNION ALL
SELECT '4354', 100, 'active'
UNION ALL
SELECT '4355', 100, 'active'
UNION ALL
SELECT '4356', 100, 'active'
UNION ALL
SELECT '4357', 100, 'active'
UNION ALL
SELECT '4360', 100, 'active'
UNION ALL
SELECT '4361', 100, 'active'
UNION ALL
SELECT '4363', 100, 'active'
UNION ALL
SELECT '4364', 100, 'active'
UNION ALL
SELECT '4368', 100, 'active'
UNION ALL
SELECT '4370', 100, 'active'
UNION ALL
SELECT '4373', 100, 'active'
UNION ALL
SELECT '4374', 100, 'active'
UNION ALL
SELECT '465', 100, 'active'
UNION ALL
SELECT '489', 100, 'active'
UNION ALL
SELECT '5', 100, 'active'
UNION ALL
SELECT '525', 100, 'active'
UNION ALL
SELECT '526', 100, 'active'
UNION ALL
SELECT '551', 100, 'active'
UNION ALL
SELECT '560', 100, 'active'
UNION ALL
SELECT '561', 100, 'active'
UNION ALL
SELECT '562', 100, 'active'
UNION ALL
SELECT '582', 100, 'active'
UNION ALL
SELECT '590', 100, 'active'
UNION ALL
SELECT '591', 100, 'active'
UNION ALL
SELECT '599', 100, 'active'
UNION ALL
SELECT '602', 100, 'active'
UNION ALL
SELECT '606', 100, 'active'
UNION ALL
SELECT '613', 100, 'active'
UNION ALL
SELECT '62', 100, 'active'
UNION ALL
SELECT '625', 100, 'active'
UNION ALL
SELECT '63', 100, 'active'
UNION ALL
SELECT '632', 100, 'active'
UNION ALL
SELECT '639', 100, 'active'
UNION ALL
SELECT '640', 100, 'active'
UNION ALL
SELECT '641', 100, 'active'
UNION ALL
SELECT '642', 100, 'active'
UNION ALL
SELECT '643', 100, 'active'
UNION ALL
SELECT '644', 100, 'active'
UNION ALL
SELECT '646', 100, 'active'
UNION ALL
SELECT '647', 100, 'active'
UNION ALL
SELECT '648', 100, 'active'
UNION ALL
SELECT '649', 100, 'active'
UNION ALL
SELECT '651', 100, 'active'
UNION ALL
SELECT '655', 100, 'active'
UNION ALL
SELECT '656', 100, 'active'
UNION ALL
SELECT '657', 100, 'active'
UNION ALL
SELECT '658', 100, 'active'
UNION ALL
SELECT '659', 100, 'active'
UNION ALL
SELECT '66', 100, 'active'
UNION ALL
SELECT '661', 100, 'active'
UNION ALL
SELECT '666', 100, 'active'
UNION ALL
SELECT '668', 100, 'active'
UNION ALL
SELECT '669', 100, 'active'
UNION ALL
SELECT '67', 100, 'active'
UNION ALL
SELECT '670', 100, 'active'
UNION ALL
SELECT '671', 100, 'active'
UNION ALL
SELECT '672', 100, 'active'
UNION ALL
SELECT '673', 100, 'active'
UNION ALL
SELECT '674', 100, 'active'
UNION ALL
SELECT '675', 100, 'active'
UNION ALL
SELECT '676', 100, 'active'
UNION ALL
SELECT '679', 100, 'active'
UNION ALL
SELECT '68', 100, 'active'
UNION ALL
SELECT '681', 100, 'active'
UNION ALL
SELECT '682', 100, 'active'
UNION ALL
SELECT '684', 100, 'active'
UNION ALL
SELECT '685', 100, 'active'
UNION ALL
SELECT '686', 100, 'active'
UNION ALL
SELECT '71', 100, 'active'
UNION ALL
SELECT '72', 100, 'active'
UNION ALL
SELECT '74', 100, 'active'
UNION ALL
SELECT '748', 100, 'active'
UNION ALL
SELECT '761', 100, 'active'
UNION ALL
SELECT '762', 100, 'active'
UNION ALL
SELECT '763', 100, 'active'
UNION ALL
SELECT '764', 100, 'active'
UNION ALL
SELECT '765', 100, 'active'
UNION ALL
SELECT '766', 100, 'active'
UNION ALL
SELECT '800', 100, 'active'
UNION ALL
SELECT '82', 100, 'active'
UNION ALL
SELECT '83', 100, 'active'
UNION ALL
SELECT '909', 100, 'active'
UNION ALL
SELECT '92', 100, 'active'
UNION ALL
SELECT '93', 100, 'active'
UNION ALL
SELECT '94', 100, 'active'
UNION ALL
SELECT '95', 100, 'active'
UNION ALL
SELECT '958', 100, 'active'
UNION ALL
SELECT '96', 100, 'active'
UNION ALL
SELECT '97', 100, 'active'
UNION ALL
SELECT '98', 100, 'active'
UNION ALL
SELECT 'HS004', 100, 'active'
UNION ALL
SELECT 'HS025', 100, 'active'
UNION ALL
SELECT 'HS078', 100, 'active'
UNION ALL
SELECT 'HS081', 100, 'active'
UNION ALL
SELECT 'K015', 100, 'active'
UNION ALL
SELECT 'K091', 100, 'active'
UNION ALL
SELECT 'K092', 100, 'active'
UNION ALL
SELECT 'K100', 100, 'active'
UNION ALL
SELECT 'K101', 100, 'active'
UNION ALL
SELECT 'K102', 100, 'active'
UNION ALL
SELECT 'K103', 100, 'active'
) AS s
JOIN users u ON u.username=s.worker_code
ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), training_percent=VALUES(training_percent), status='active' ;

INSERT INTO workers (user_id, worker_code, department, position, training_percent, status)
SELECT u.id, s.worker_code, 'Sản xuất', 'Công nhân', COALESCE(s.training_percent,100), 'active'
FROM (
SELECT 'P599' AS `worker_code`, 100 AS `training_percent`, 'active' AS `status`
UNION ALL
SELECT 'V2278', 100, 'active'
UNION ALL
SELECT 'V748', 100, 'active'
UNION ALL
SELECT 'VH10-158', 100, 'active'
UNION ALL
SELECT 'VH7-010', 100, 'active'
UNION ALL
SELECT 'VH7-012', 100, 'active'
UNION ALL
SELECT 'VH7-019', 100, 'active'
UNION ALL
SELECT 'VH7-027', 100, 'active'
UNION ALL
SELECT 'VH7-028', 100, 'active'
UNION ALL
SELECT 'VH8-067', 100, 'active'
UNION ALL
SELECT 'VH8-162', 100, 'active'
UNION ALL
SELECT 'VH8-43', 100, 'active'
UNION ALL
SELECT 'VH8-44', 100, 'active'
UNION ALL
SELECT 'VH8-48', 100, 'active'
UNION ALL
SELECT 'VH8-49', 100, 'active'
UNION ALL
SELECT 'VH8-52', 100, 'active'
UNION ALL
SELECT 'VH8-53', 100, 'active'
UNION ALL
SELECT 'VH8-56', 100, 'active'
UNION ALL
SELECT 'VH8-58', 100, 'active'
UNION ALL
SELECT 'VH8-63', 100, 'active'
UNION ALL
SELECT 'VH8-70', 100, 'active'
UNION ALL
SELECT 'VH8-73', 100, 'active'
UNION ALL
SELECT 'VH8-81', 100, 'active'
UNION ALL
SELECT 'VH9-090', 100, 'active'
UNION ALL
SELECT 'VH9-091', 100, 'active'
UNION ALL
SELECT 'VH9-099', 100, 'active'
UNION ALL
SELECT 'VH9-100', 100, 'active'
UNION ALL
SELECT 'VH9-103', 100, 'active'
UNION ALL
SELECT 'VH9-104', 100, 'active'
UNION ALL
SELECT 'VH9-105', 100, 'active'
UNION ALL
SELECT 'VH9-107', 100, 'active'
UNION ALL
SELECT 'VH9-111', 100, 'active'
UNION ALL
SELECT 'VH9-112', 100, 'active'
UNION ALL
SELECT 'VH9-123', 100, 'active'
UNION ALL
SELECT 'VH9-124', 100, 'active'
UNION ALL
SELECT 'VH9-93', 100, 'active'
UNION ALL
SELECT 'h101', 100, 'active'
UNION ALL
SELECT 'h110', 100, 'active'
UNION ALL
SELECT 'h114', 100, 'active'
UNION ALL
SELECT 'h116', 100, 'active'
UNION ALL
SELECT 'h117', 100, 'active'
UNION ALL
SELECT 'h118', 100, 'active'
UNION ALL
SELECT 'h120', 100, 'active'
UNION ALL
SELECT 'h121', 100, 'active'
UNION ALL
SELECT 'h122', 100, 'active'
UNION ALL
SELECT 'h22', 100, 'active'
UNION ALL
SELECT 'h23', 100, 'active'
UNION ALL
SELECT 'h30', 100, 'active'
UNION ALL
SELECT 'h31', 100, 'active'
UNION ALL
SELECT 'h36', 100, 'active'
UNION ALL
SELECT 'h37', 100, 'active'
UNION ALL
SELECT 'h41', 100, 'active'
UNION ALL
SELECT 'h42', 100, 'active'
UNION ALL
SELECT 'h7', 100, 'active'
UNION ALL
SELECT 'hs002', 100, 'active'
UNION ALL
SELECT 'hs003', 100, 'active'
UNION ALL
SELECT 'hs006', 100, 'active'
UNION ALL
SELECT 'hs008', 100, 'active'
UNION ALL
SELECT 'hs009', 100, 'active'
UNION ALL
SELECT 'hs014', 100, 'active'
UNION ALL
SELECT 'hs015', 100, 'active'
UNION ALL
SELECT 'hs017', 100, 'active'
UNION ALL
SELECT 'hs018', 100, 'active'
UNION ALL
SELECT 'hs021', 100, 'active'
UNION ALL
SELECT 'hs024', 100, 'active'
UNION ALL
SELECT 'hs026', 100, 'active'
UNION ALL
SELECT 'hs033', 100, 'active'
UNION ALL
SELECT 'hs034', 100, 'active'
UNION ALL
SELECT 'hs038', 100, 'active'
UNION ALL
SELECT 'hs046', 100, 'active'
UNION ALL
SELECT 'hs054', 100, 'active'
UNION ALL
SELECT 'hs057', 100, 'active'
UNION ALL
SELECT 'hs061', 100, 'active'
UNION ALL
SELECT 'hs062', 100, 'active'
UNION ALL
SELECT 'hs074', 100, 'active'
UNION ALL
SELECT 'hs076', 100, 'active'
UNION ALL
SELECT 'hs077', 100, 'active'
UNION ALL
SELECT 'hs079', 100, 'active'
UNION ALL
SELECT 'hs083', 100, 'active'
UNION ALL
SELECT 'hs085', 100, 'active'
UNION ALL
SELECT 'hs097', 100, 'active'
UNION ALL
SELECT 'hs098', 100, 'active'
UNION ALL
SELECT 'hs113', 100, 'active'
UNION ALL
SELECT 'hs115', 100, 'active'
UNION ALL
SELECT 'hs125', 100, 'active'
UNION ALL
SELECT 'hs126', 100, 'active'
UNION ALL
SELECT 'hs127', 100, 'active'
UNION ALL
SELECT 'hs129', 100, 'active'
UNION ALL
SELECT 'hs130', 100, 'active'
UNION ALL
SELECT 'hs134', 100, 'active'
UNION ALL
SELECT 'hs135', 100, 'active'
UNION ALL
SELECT 'hs137', 100, 'active'
UNION ALL
SELECT 'hs138', 100, 'active'
UNION ALL
SELECT 'hs141', 100, 'active'
UNION ALL
SELECT 'hs145', 100, 'active'
UNION ALL
SELECT 'hs146', 100, 'active'
UNION ALL
SELECT 'hs151', 100, 'active'
UNION ALL
SELECT 'hs156', 100, 'active'
UNION ALL
SELECT 'k010', 100, 'active'
UNION ALL
SELECT 'k104', 100, 'active'
UNION ALL
SELECT 'k133', 100, 'active'
UNION ALL
SELECT 'k136', 100, 'active'
UNION ALL
SELECT 'k139', 100, 'active'
UNION ALL
SELECT 'k144', 100, 'active'
UNION ALL
SELECT 'k148', 100, 'active'
UNION ALL
SELECT 'k149', 100, 'active'
UNION ALL
SELECT 'k155', 100, 'active'
UNION ALL
SELECT 'k157', 100, 'active'
UNION ALL
SELECT 'k160', 100, 'active'
UNION ALL
SELECT 'k164', 100, 'active'
UNION ALL
SELECT 'k45', 100, 'active'
UNION ALL
SELECT 'k46', 100, 'active'
UNION ALL
SELECT 'k47', 100, 'active'
UNION ALL
SELECT 'k50', 100, 'active'
UNION ALL
SELECT 'k64', 100, 'active'
UNION ALL
SELECT 'k66', 100, 'active'
UNION ALL
SELECT 'k68', 100, 'active'
UNION ALL
SELECT 'k69', 100, 'active'
UNION ALL
SELECT 'k71', 100, 'active'
UNION ALL
SELECT 'k72', 100, 'active'
UNION ALL
SELECT 'k74', 100, 'active'
UNION ALL
SELECT 'k78', 100, 'active'
UNION ALL
SELECT 'k80', 100, 'active'
UNION ALL
SELECT 'k82', 100, 'active'
UNION ALL
SELECT 'k84', 100, 'active'
UNION ALL
SELECT 'k87', 100, 'active'
UNION ALL
SELECT 't-551', 100, 'active'
UNION ALL
SELECT 'v1134', 100, 'active'
UNION ALL
SELECT 'v1333', 100, 'active'
UNION ALL
SELECT 'v1448', 100, 'active'
UNION ALL
SELECT 'v1572', 100, 'active'
UNION ALL
SELECT 'v2284', 100, 'active'
UNION ALL
SELECT 'v2564', 100, 'active'
UNION ALL
SELECT 'v2984', 100, 'active'
UNION ALL
SELECT 'v3046', 100, 'active'
UNION ALL
SELECT 'v3263', 100, 'active'
UNION ALL
SELECT 'v3351', 100, 'active'
UNION ALL
SELECT 'v3607', 100, 'active'
UNION ALL
SELECT 'v3622', 100, 'active'
UNION ALL
SELECT 'v3971', 100, 'active'
UNION ALL
SELECT 'v4083', 100, 'active'
UNION ALL
SELECT 'v416', 100, 'active'
UNION ALL
SELECT 'v4162', 100, 'active'
) AS s
JOIN users u ON u.username=s.worker_code
ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), training_percent=VALUES(training_percent), status='active' ;

-- ============================================================================
-- 10. PHÂN CÔNG CÔNG ĐOẠN
-- ============================================================================
INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, p.id
FROM (
SELECT '1' AS `worker_code`, 'XLBV' AS `process_code`
UNION ALL
SELECT '100', 'EP'
UNION ALL
SELECT '1007', 'XLBV'
UNION ALL
SELECT '1010', 'XLBV'
UNION ALL
SELECT '102', 'EP'
UNION ALL
SELECT '1020', 'GC'
UNION ALL
SELECT '1020', 'MAI'
UNION ALL
SELECT '1020', 'DO'
UNION ALL
SELECT '1020', 'K2'
UNION ALL
SELECT '1020', 'XLBV'
UNION ALL
SELECT '104', 'EP'
UNION ALL
SELECT '107', 'EP'
UNION ALL
SELECT '108', 'EP'
UNION ALL
SELECT '109', 'K1'
UNION ALL
SELECT '109', 'EP'
UNION ALL
SELECT '1094', 'GC'
UNION ALL
SELECT '1094', 'MAI'
UNION ALL
SELECT '1094', 'DO'
UNION ALL
SELECT '1094', 'K2'
UNION ALL
SELECT '110', 'EP'
UNION ALL
SELECT '111', 'EP'
UNION ALL
SELECT '112', 'EP'
UNION ALL
SELECT '113', 'EP'
UNION ALL
SELECT '1134', 'GC'
UNION ALL
SELECT '1134', 'MAI'
UNION ALL
SELECT '1134', 'DO'
UNION ALL
SELECT '1134', 'K2'
UNION ALL
SELECT '117', 'EP'
UNION ALL
SELECT '118', 'EP'
UNION ALL
SELECT '124', 'K1'
UNION ALL
SELECT '1246', 'GC'
UNION ALL
SELECT '1246', 'MAI'
UNION ALL
SELECT '1246', 'DO'
UNION ALL
SELECT '1246', 'K2'
UNION ALL
SELECT '1253', 'GC'
UNION ALL
SELECT '1253', 'MAI'
UNION ALL
SELECT '1253', 'DO'
UNION ALL
SELECT '1253', 'K2'
UNION ALL
SELECT '126', 'EP'
UNION ALL
SELECT '13', 'K1'
UNION ALL
SELECT '1328', 'GC'
UNION ALL
SELECT '1328', 'MAI'
UNION ALL
SELECT '1328', 'DO'
UNION ALL
SELECT '1328', 'K2'
UNION ALL
SELECT '1333', 'GC'
UNION ALL
SELECT '1333', 'MAI'
UNION ALL
SELECT '1333', 'DO'
UNION ALL
SELECT '1333', 'K2'
UNION ALL
SELECT '1333', 'K1'
UNION ALL
SELECT '1369', 'K2'
UNION ALL
SELECT '1369', 'K1'
UNION ALL
SELECT '140', 'K1'
UNION ALL
SELECT '141', 'K1'
UNION ALL
SELECT '1443', 'GC'
UNION ALL
SELECT '1443', 'MAI'
UNION ALL
SELECT '1443', 'DO'
UNION ALL
SELECT '1443', 'K2'
UNION ALL
SELECT '1445', 'GC'
UNION ALL
SELECT '1445', 'MAI'
UNION ALL
SELECT '1445', 'DO'
UNION ALL
SELECT '1445', 'K2'
UNION ALL
SELECT '1446', 'MAI'
UNION ALL
SELECT '1446', 'DO'
UNION ALL
SELECT '1446', 'K2'
UNION ALL
SELECT '1448', 'GC'
UNION ALL
SELECT '1448', 'MAI'
UNION ALL
SELECT '1448', 'DO'
UNION ALL
SELECT '1448', 'K2'
UNION ALL
SELECT '1448', 'K1'
UNION ALL
SELECT '1448', 'XLBV'
UNION ALL
SELECT '146', 'K1'
UNION ALL
SELECT '1476', 'GC'
UNION ALL
SELECT '1476', 'MAI'
UNION ALL
SELECT '1476', 'DO'
UNION ALL
SELECT '1476', 'K2'
UNION ALL
SELECT '1493', 'K2'
UNION ALL
SELECT '152', 'K1'
UNION ALL
SELECT '153', 'K1'
UNION ALL
SELECT '1541', 'GC'
UNION ALL
SELECT '1541', 'MAI'
UNION ALL
SELECT '1541', 'DO'
UNION ALL
SELECT '1541', 'K2'
UNION ALL
SELECT '1562', 'GC'
UNION ALL
SELECT '1562', 'MAI'
UNION ALL
SELECT '1562', 'DO'
UNION ALL
SELECT '1562', 'K2'
UNION ALL
SELECT '1571', 'GC'
UNION ALL
SELECT '1571', 'MAI'
UNION ALL
SELECT '1571', 'DO'
UNION ALL
SELECT '1571', 'K2'
UNION ALL
SELECT '1572', 'GC'
UNION ALL
SELECT '1572', 'MAI'
UNION ALL
SELECT '1572', 'DO'
UNION ALL
SELECT '1572', 'K2'
UNION ALL
SELECT '159', 'K1'
UNION ALL
SELECT '1594', 'GC'
UNION ALL
SELECT '1594', 'MAI'
UNION ALL
SELECT '1594', 'DO'
UNION ALL
SELECT '1594', 'K2'
UNION ALL
SELECT '1610', 'GC'
UNION ALL
SELECT '1610', 'MAI'
UNION ALL
SELECT '1610', 'DO'
UNION ALL
SELECT '1610', 'K2'
UNION ALL
SELECT '1643', 'MAI'
UNION ALL
SELECT '1643', 'DO'
UNION ALL
SELECT '1643', 'K2'
UNION ALL
SELECT '1656', 'GC'
UNION ALL
SELECT '1656', 'MAI'
UNION ALL
SELECT '1656', 'DO'
UNION ALL
SELECT '1656', 'K2'
UNION ALL
SELECT '1656', 'K1'
UNION ALL
SELECT '1677', 'GC'
UNION ALL
SELECT '1677', 'MAI'
UNION ALL
SELECT '1677', 'DO'
UNION ALL
SELECT '1677', 'K2'
UNION ALL
SELECT '1700', 'MAI'
UNION ALL
SELECT '1700', 'DO'
UNION ALL
SELECT '1733', 'MAI'
UNION ALL
SELECT '1733', 'DO'
UNION ALL
SELECT '1733', 'K2'
UNION ALL
SELECT '1733', 'K1'
UNION ALL
SELECT '1733', 'XLBV'
UNION ALL
SELECT '1733', 'EP'
UNION ALL
SELECT '1777', 'GC'
UNION ALL
SELECT '1777', 'MAI'
UNION ALL
SELECT '1777', 'DO'
UNION ALL
SELECT '1777', 'K2'
UNION ALL
SELECT '1845', 'GC'
UNION ALL
SELECT '1845', 'MAI'
UNION ALL
SELECT '1845', 'DO'
UNION ALL
SELECT '1845', 'K2'
UNION ALL
SELECT '1850', 'GC'
UNION ALL
SELECT '1850', 'MAI'
UNION ALL
SELECT '1850', 'DO'
UNION ALL
SELECT '1850', 'K2'
UNION ALL
SELECT '1933', 'GC'
UNION ALL
SELECT '1933', 'MAI'
UNION ALL
SELECT '1933', 'DO'
UNION ALL
SELECT '1933', 'K2'
UNION ALL
SELECT '1963', 'GC'
UNION ALL
SELECT '1963', 'MAI'
UNION ALL
SELECT '1963', 'DO'
UNION ALL
SELECT '1963', 'K2'
UNION ALL
SELECT '2', 'XLBV'
UNION ALL
SELECT '2009', 'GC'
UNION ALL
SELECT '2009', 'MAI'
UNION ALL
SELECT '2009', 'DO'
UNION ALL
SELECT '2009', 'K2'
UNION ALL
SELECT '2010', 'K1'
UNION ALL
SELECT '2030', 'K1'
UNION ALL
SELECT '2030', 'XLBV'
UNION ALL
SELECT '2030', 'EP'
UNION ALL
SELECT '2030', 'CAN'
UNION ALL
SELECT '2210', 'K1'
UNION ALL
SELECT '2210', 'XLBV'
UNION ALL
SELECT '2210', 'EP'
UNION ALL
SELECT '2278', 'GC'
UNION ALL
SELECT '2278', 'MAI'
UNION ALL
SELECT '2278', 'DO'
UNION ALL
SELECT '2278', 'K2'
UNION ALL
SELECT '2284', 'GC'
UNION ALL
SELECT '2284', 'MAI'
UNION ALL
SELECT '2284', 'DO'
UNION ALL
SELECT '2284', 'K2'
UNION ALL
SELECT '2327', 'GC'
UNION ALL
SELECT '2327', 'MAI'
UNION ALL
SELECT '2327', 'DO'
UNION ALL
SELECT '2327', 'K2'
UNION ALL
SELECT '2374', 'GC'
UNION ALL
SELECT '2374', 'MAI'
UNION ALL
SELECT '2374', 'DO'
UNION ALL
SELECT '2374', 'K2'
UNION ALL
SELECT '2399', 'GC'
UNION ALL
SELECT '2399', 'MAI'
UNION ALL
SELECT '2399', 'DO'
UNION ALL
SELECT '2399', 'K2'
UNION ALL
SELECT '2461', 'K2'
UNION ALL
SELECT '2461', 'K1'
UNION ALL
SELECT '2461', 'XLBV'
UNION ALL
SELECT '2461', 'EP'
) AS s
JOIN workers w ON w.worker_code=s.worker_code
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code)) ;

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, p.id
FROM (
SELECT '2488' AS `worker_code`, 'K1' AS `process_code`
UNION ALL
SELECT '2488', 'XLBV'
UNION ALL
SELECT '2488', 'EP'
UNION ALL
SELECT '25', 'K1'
UNION ALL
SELECT '2516', 'GC'
UNION ALL
SELECT '2516', 'MAI'
UNION ALL
SELECT '2516', 'DO'
UNION ALL
SELECT '2516', 'K2'
UNION ALL
SELECT '2545', 'GC'
UNION ALL
SELECT '2564', 'GC'
UNION ALL
SELECT '2564', 'MAI'
UNION ALL
SELECT '2564', 'DO'
UNION ALL
SELECT '2564', 'K2'
UNION ALL
SELECT '2625', 'GC'
UNION ALL
SELECT '2625', 'K1'
UNION ALL
SELECT '2625', 'XLBV'
UNION ALL
SELECT '2625', 'EP'
UNION ALL
SELECT '2631', 'GC'
UNION ALL
SELECT '2631', 'MAI'
UNION ALL
SELECT '2631', 'DO'
UNION ALL
SELECT '2631', 'K2'
UNION ALL
SELECT '2643', 'XLBV'
UNION ALL
SELECT '2649', 'GC'
UNION ALL
SELECT '2649', 'MAI'
UNION ALL
SELECT '2649', 'DO'
UNION ALL
SELECT '2649', 'K2'
UNION ALL
SELECT '2747', 'XLBV'
UNION ALL
SELECT '2747', 'EP'
UNION ALL
SELECT '2747', 'CAN'
UNION ALL
SELECT '2756', 'GC'
UNION ALL
SELECT '2756', 'MAI'
UNION ALL
SELECT '2756', 'DO'
UNION ALL
SELECT '2756', 'K2'
UNION ALL
SELECT '2763', 'XLBV'
UNION ALL
SELECT '2763', 'EP'
UNION ALL
SELECT '2763', 'CAN'
UNION ALL
SELECT '2794', 'GC'
UNION ALL
SELECT '2794', 'MAI'
UNION ALL
SELECT '2794', 'DO'
UNION ALL
SELECT '2794', 'K2'
UNION ALL
SELECT '2798', 'XLBV'
UNION ALL
SELECT '2798', 'EP'
UNION ALL
SELECT '2798', 'CAN'
UNION ALL
SELECT '2804', 'K2'
UNION ALL
SELECT '2804', 'XLBV'
UNION ALL
SELECT '2837', 'GC'
UNION ALL
SELECT '2837', 'MAI'
UNION ALL
SELECT '2837', 'DO'
UNION ALL
SELECT '2837', 'K2'
UNION ALL
SELECT '2849', 'GC'
UNION ALL
SELECT '2849', 'MAI'
UNION ALL
SELECT '2849', 'DO'
UNION ALL
SELECT '2849', 'K2'
UNION ALL
SELECT '2851', 'GC'
UNION ALL
SELECT '2851', 'MAI'
UNION ALL
SELECT '2851', 'DO'
UNION ALL
SELECT '2851', 'K2'
UNION ALL
SELECT '2856', 'XLBV'
UNION ALL
SELECT '2865', 'GC'
UNION ALL
SELECT '2865', 'MAI'
UNION ALL
SELECT '2865', 'DO'
UNION ALL
SELECT '2865', 'K2'
UNION ALL
SELECT '2866', 'GC'
UNION ALL
SELECT '2866', 'MAI'
UNION ALL
SELECT '2866', 'DO'
UNION ALL
SELECT '2866', 'K2'
UNION ALL
SELECT '2890', 'GC'
UNION ALL
SELECT '2890', 'MAI'
UNION ALL
SELECT '2890', 'DO'
UNION ALL
SELECT '2890', 'K2'
UNION ALL
SELECT '2895', 'GC'
UNION ALL
SELECT '2895', 'MAI'
UNION ALL
SELECT '2895', 'DO'
UNION ALL
SELECT '2895', 'K2'
UNION ALL
SELECT '2938', 'GC'
UNION ALL
SELECT '2938', 'MAI'
UNION ALL
SELECT '2938', 'DO'
UNION ALL
SELECT '2938', 'K2'
UNION ALL
SELECT '2959', 'GC'
UNION ALL
SELECT '2959', 'MAI'
UNION ALL
SELECT '2959', 'DO'
UNION ALL
SELECT '2959', 'K2'
UNION ALL
SELECT '2960', 'GC'
UNION ALL
SELECT '2960', 'MAI'
UNION ALL
SELECT '2960', 'DO'
UNION ALL
SELECT '2960', 'K2'
UNION ALL
SELECT '2984', 'GC'
UNION ALL
SELECT '2984', 'MAI'
UNION ALL
SELECT '2984', 'DO'
UNION ALL
SELECT '2984', 'K2'
UNION ALL
SELECT '2984', 'K1'
UNION ALL
SELECT '3', 'XLBV'
UNION ALL
SELECT '3037', 'EP'
UNION ALL
SELECT '3046', 'GC'
UNION ALL
SELECT '3046', 'MAI'
UNION ALL
SELECT '3046', 'DO'
UNION ALL
SELECT '3046', 'K2'
UNION ALL
SELECT '3111', 'GC'
UNION ALL
SELECT '3111', 'MAI'
UNION ALL
SELECT '3111', 'DO'
UNION ALL
SELECT '3111', 'K2'
UNION ALL
SELECT '3123', 'GC'
UNION ALL
SELECT '3123', 'MAI'
UNION ALL
SELECT '3123', 'DO'
UNION ALL
SELECT '3123', 'K2'
UNION ALL
SELECT '3130', 'XLBV'
UNION ALL
SELECT '3130', 'EP'
UNION ALL
SELECT '3130', 'CAN'
UNION ALL
SELECT '3135', 'XLBV'
UNION ALL
SELECT '3135', 'EP'
UNION ALL
SELECT '3171', 'GC'
UNION ALL
SELECT '3171', 'MAI'
UNION ALL
SELECT '3171', 'DO'
UNION ALL
SELECT '3171', 'K2'
UNION ALL
SELECT '3187', 'GC'
UNION ALL
SELECT '3187', 'MAI'
UNION ALL
SELECT '3187', 'DO'
UNION ALL
SELECT '3187', 'K2'
UNION ALL
SELECT '3234', 'GC'
UNION ALL
SELECT '3234', 'MAI'
UNION ALL
SELECT '3234', 'DO'
UNION ALL
SELECT '3234', 'K2'
UNION ALL
SELECT '3244', 'GC'
UNION ALL
SELECT '3244', 'MAI'
UNION ALL
SELECT '3244', 'DO'
UNION ALL
SELECT '3244', 'K2'
UNION ALL
SELECT '3258', 'GC'
UNION ALL
SELECT '3258', 'MAI'
UNION ALL
SELECT '3258', 'DO'
UNION ALL
SELECT '3258', 'K2'
UNION ALL
SELECT '3263', 'GC'
UNION ALL
SELECT '3263', 'MAI'
UNION ALL
SELECT '3263', 'DO'
UNION ALL
SELECT '3263', 'K2'
UNION ALL
SELECT '3268', 'GC'
UNION ALL
SELECT '3268', 'MAI'
UNION ALL
SELECT '3268', 'DO'
UNION ALL
SELECT '3268', 'K2'
UNION ALL
SELECT '3277', 'GC'
UNION ALL
SELECT '3277', 'MAI'
UNION ALL
SELECT '3277', 'DO'
UNION ALL
SELECT '3277', 'K2'
UNION ALL
SELECT '3289', 'XLBV'
UNION ALL
SELECT '3292', 'MAI'
UNION ALL
SELECT '3292', 'DO'
UNION ALL
SELECT '3292', 'K1'
UNION ALL
SELECT '3292', 'XLBV'
UNION ALL
SELECT '3292', 'EP'
UNION ALL
SELECT '3293', 'K1'
UNION ALL
SELECT '3293', 'XLBV'
UNION ALL
SELECT '3293', 'EP'
UNION ALL
SELECT '3295', 'GC'
UNION ALL
SELECT '3295', 'MAI'
UNION ALL
SELECT '3295', 'DO'
UNION ALL
SELECT '3295', 'K2'
UNION ALL
SELECT '3300', 'XLBV'
UNION ALL
SELECT '3302', 'XLBV'
UNION ALL
SELECT '3302', 'EP'
UNION ALL
SELECT '3302', 'CAN'
UNION ALL
SELECT '3303', 'GC'
UNION ALL
SELECT '3303', 'MAI'
UNION ALL
SELECT '3303', 'DO'
UNION ALL
SELECT '3303', 'K2'
UNION ALL
SELECT '3304', 'EP'
UNION ALL
SELECT '3305', 'K2'
UNION ALL
SELECT '3305', 'K1'
UNION ALL
SELECT '3305', 'XLBV'
UNION ALL
SELECT '3305', 'EP'
UNION ALL
SELECT '3321', 'EP'
UNION ALL
SELECT '3324', 'EP'
UNION ALL
SELECT '3337', 'GC'
UNION ALL
SELECT '3337', 'MAI'
UNION ALL
SELECT '3337', 'DO'
UNION ALL
SELECT '3337', 'K2'
UNION ALL
SELECT '3343', 'XLBV'
UNION ALL
SELECT '3343', 'EP'
UNION ALL
SELECT '3343', 'CAN'
UNION ALL
SELECT '3349', 'GC'
UNION ALL
SELECT '3349', 'MAI'
UNION ALL
SELECT '3349', 'DO'
) AS s
JOIN workers w ON w.worker_code=s.worker_code
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code)) ;

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, p.id
FROM (
SELECT '3349' AS `worker_code`, 'K2' AS `process_code`
UNION ALL
SELECT '3351', 'GC'
UNION ALL
SELECT '3351', 'MAI'
UNION ALL
SELECT '3351', 'DO'
UNION ALL
SELECT '3351', 'K2'
UNION ALL
SELECT '3352', 'GC'
UNION ALL
SELECT '3352', 'MAI'
UNION ALL
SELECT '3352', 'DO'
UNION ALL
SELECT '3352', 'K2'
UNION ALL
SELECT '3353', 'GC'
UNION ALL
SELECT '3353', 'MAI'
UNION ALL
SELECT '3353', 'DO'
UNION ALL
SELECT '3353', 'K2'
UNION ALL
SELECT '3371', 'K1'
UNION ALL
SELECT '3371', 'XLBV'
UNION ALL
SELECT '3371', 'EP'
UNION ALL
SELECT '3372', 'EP'
UNION ALL
SELECT '3377', 'EP'
UNION ALL
SELECT '3379', 'GC'
UNION ALL
SELECT '3379', 'MAI'
UNION ALL
SELECT '3379', 'DO'
UNION ALL
SELECT '3379', 'K2'
UNION ALL
SELECT '3379', 'K1'
UNION ALL
SELECT '3380', 'GC'
UNION ALL
SELECT '3380', 'MAI'
UNION ALL
SELECT '3380', 'DO'
UNION ALL
SELECT '3380', 'K2'
UNION ALL
SELECT '3388', 'XLBV'
UNION ALL
SELECT '3388', 'EP'
UNION ALL
SELECT '3390', 'XLBV'
UNION ALL
SELECT '3390', 'EP'
UNION ALL
SELECT '3394', 'XLBV'
UNION ALL
SELECT '3394', 'EP'
UNION ALL
SELECT '3398', 'XLBV'
UNION ALL
SELECT '3398', 'EP'
UNION ALL
SELECT '3414', 'XLBV'
UNION ALL
SELECT '3414', 'EP'
UNION ALL
SELECT '3414', 'CAN'
UNION ALL
SELECT '342', 'XLBV'
UNION ALL
SELECT '3421', 'EP'
UNION ALL
SELECT '3456', 'XLBV'
UNION ALL
SELECT '3456', 'EP'
UNION ALL
SELECT '3499', 'GC'
UNION ALL
SELECT '3499', 'MAI'
UNION ALL
SELECT '3499', 'DO'
UNION ALL
SELECT '3499', 'K2'
UNION ALL
SELECT '352', 'EP'
UNION ALL
SELECT '3526', 'GC'
UNION ALL
SELECT '3526', 'MAI'
UNION ALL
SELECT '3526', 'DO'
UNION ALL
SELECT '3526', 'K2'
UNION ALL
SELECT '3567', 'XLBV'
UNION ALL
SELECT '3567', 'EP'
UNION ALL
SELECT '3567', 'CAN'
UNION ALL
SELECT '357', 'GC'
UNION ALL
SELECT '357', 'MAI'
UNION ALL
SELECT '357', 'DO'
UNION ALL
SELECT '357', 'K2'
UNION ALL
SELECT '3571', 'MAI'
UNION ALL
SELECT '3571', 'DO'
UNION ALL
SELECT '3571', 'K2'
UNION ALL
SELECT '3588', 'EP'
UNION ALL
SELECT '3590', 'GC'
UNION ALL
SELECT '3605', 'GC'
UNION ALL
SELECT '3605', 'MAI'
UNION ALL
SELECT '3605', 'DO'
UNION ALL
SELECT '3605', 'K2'
UNION ALL
SELECT '3606', 'GC'
UNION ALL
SELECT '3606', 'MAI'
UNION ALL
SELECT '3606', 'DO'
UNION ALL
SELECT '3606', 'K2'
UNION ALL
SELECT '3607', 'GC'
UNION ALL
SELECT '3607', 'MAI'
UNION ALL
SELECT '3607', 'DO'
UNION ALL
SELECT '3607', 'K2'
UNION ALL
SELECT '3617', 'XLBV'
UNION ALL
SELECT '3617', 'EP'
UNION ALL
SELECT '3619', 'EP'
UNION ALL
SELECT '3622', 'GC'
UNION ALL
SELECT '3622', 'MAI'
UNION ALL
SELECT '3622', 'DO'
UNION ALL
SELECT '3622', 'K2'
UNION ALL
SELECT '3626', 'XLBV'
UNION ALL
SELECT '3626', 'EP'
UNION ALL
SELECT '3632', 'K1'
UNION ALL
SELECT '3632', 'EP'
UNION ALL
SELECT '3637', 'GC'
UNION ALL
SELECT '3637', 'MAI'
UNION ALL
SELECT '3637', 'DO'
UNION ALL
SELECT '3637', 'K2'
UNION ALL
SELECT '3637', 'K1'
UNION ALL
SELECT '3638', 'GC'
UNION ALL
SELECT '3638', 'MAI'
UNION ALL
SELECT '3638', 'DO'
UNION ALL
SELECT '3638', 'K2'
UNION ALL
SELECT '3645', 'XLBV'
UNION ALL
SELECT '3645', 'EP'
UNION ALL
SELECT '3648', 'EP'
UNION ALL
SELECT '3650', 'XLBV'
UNION ALL
SELECT '3650', 'EP'
UNION ALL
SELECT '3650', 'CAN'
UNION ALL
SELECT '3653', 'GC'
UNION ALL
SELECT '3653', 'MAI'
UNION ALL
SELECT '3653', 'DO'
UNION ALL
SELECT '3653', 'K2'
UNION ALL
SELECT '3653', 'K1'
UNION ALL
SELECT '3668', 'GC'
UNION ALL
SELECT '3668', 'MAI'
UNION ALL
SELECT '3668', 'DO'
UNION ALL
SELECT '3668', 'K2'
UNION ALL
SELECT '3671', 'K1'
UNION ALL
SELECT '3671', 'XLBV'
UNION ALL
SELECT '3671', 'EP'
UNION ALL
SELECT '3673', 'EP'
UNION ALL
SELECT '3675', 'EP'
UNION ALL
SELECT '3693', 'XLBV'
UNION ALL
SELECT '3693', 'EP'
UNION ALL
SELECT '3693', 'CAN'
UNION ALL
SELECT '3694', 'EP'
UNION ALL
SELECT '3695', 'EP'
UNION ALL
SELECT '3712', 'XLBV'
UNION ALL
SELECT '3712', 'EP'
UNION ALL
SELECT '3713', 'EP'
UNION ALL
SELECT '3715', 'GC'
UNION ALL
SELECT '3715', 'MAI'
UNION ALL
SELECT '3715', 'DO'
UNION ALL
SELECT '3715', 'K2'
UNION ALL
SELECT '3743', 'MAI'
UNION ALL
SELECT '3743', 'DO'
UNION ALL
SELECT '3743', 'K2'
UNION ALL
SELECT '3743', 'K1'
UNION ALL
SELECT '3743', 'XLBV'
UNION ALL
SELECT '3743', 'EP'
UNION ALL
SELECT '3745', 'GC'
UNION ALL
SELECT '3745', 'MAI'
UNION ALL
SELECT '3745', 'DO'
UNION ALL
SELECT '3745', 'K2'
UNION ALL
SELECT '3751', 'GC'
UNION ALL
SELECT '3751', 'MAI'
UNION ALL
SELECT '3751', 'DO'
UNION ALL
SELECT '3751', 'K2'
UNION ALL
SELECT '3752', 'GC'
UNION ALL
SELECT '3758', 'GC'
UNION ALL
SELECT '3758', 'MAI'
UNION ALL
SELECT '3758', 'DO'
UNION ALL
SELECT '3758', 'K2'
UNION ALL
SELECT '3759', 'EP'
UNION ALL
SELECT '376', 'EP'
UNION ALL
SELECT '3766', 'XLBV'
UNION ALL
SELECT '3769', 'MAI'
UNION ALL
SELECT '3769', 'DO'
UNION ALL
SELECT '3769', 'K2'
UNION ALL
SELECT '3771', 'EP'
UNION ALL
SELECT '3772', 'EP'
UNION ALL
SELECT '3779', 'EP'
UNION ALL
SELECT '3781', 'EP'
UNION ALL
SELECT '3782', 'EP'
UNION ALL
SELECT '3783', 'EP'
UNION ALL
SELECT '3784', 'EP'
UNION ALL
SELECT '3787', 'EP'
UNION ALL
SELECT '3789', 'EP'
UNION ALL
SELECT '3790', 'EP'
UNION ALL
SELECT '3792', 'EP'
UNION ALL
SELECT '3793', 'EP'
UNION ALL
SELECT '3798', 'GC'
UNION ALL
SELECT '3798', 'MAI'
UNION ALL
SELECT '3798', 'DO'
UNION ALL
SELECT '3798', 'K2'
UNION ALL
SELECT '3799', 'GC'
UNION ALL
SELECT '3799', 'MAI'
UNION ALL
SELECT '3799', 'DO'
UNION ALL
SELECT '3799', 'K2'
UNION ALL
SELECT '3800', 'EP'
UNION ALL
SELECT '3804', 'EP'
UNION ALL
SELECT '3832', 'GC'
UNION ALL
SELECT '3832', 'MAI'
UNION ALL
SELECT '3832', 'DO'
UNION ALL
SELECT '3832', 'K2'
UNION ALL
SELECT '3834', 'GC'
UNION ALL
SELECT '3840', 'GC'
) AS s
JOIN workers w ON w.worker_code=s.worker_code
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code)) ;

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, p.id
FROM (
SELECT '3842' AS `worker_code`, 'EP' AS `process_code`
UNION ALL
SELECT '3843', 'K1'
UNION ALL
SELECT '3844', 'MAI'
UNION ALL
SELECT '3844', 'DO'
UNION ALL
SELECT '3844', 'K2'
UNION ALL
SELECT '3844', 'K1'
UNION ALL
SELECT '3854', 'GC'
UNION ALL
SELECT '3854', 'MAI'
UNION ALL
SELECT '3854', 'DO'
UNION ALL
SELECT '3854', 'K2'
UNION ALL
SELECT '3856', 'EP'
UNION ALL
SELECT '3862', 'GC'
UNION ALL
SELECT '3862', 'MAI'
UNION ALL
SELECT '3862', 'DO'
UNION ALL
SELECT '3862', 'K2'
UNION ALL
SELECT '3863', 'K1'
UNION ALL
SELECT '3875', 'XLBV'
UNION ALL
SELECT '3875', 'EP'
UNION ALL
SELECT '3875', 'CAN'
UNION ALL
SELECT '3888', 'GC'
UNION ALL
SELECT '3888', 'MAI'
UNION ALL
SELECT '3888', 'DO'
UNION ALL
SELECT '3888', 'K2'
UNION ALL
SELECT '3892', 'GC'
UNION ALL
SELECT '3892', 'MAI'
UNION ALL
SELECT '3892', 'DO'
UNION ALL
SELECT '3892', 'K2'
UNION ALL
SELECT '3894', 'K2'
UNION ALL
SELECT '3899', 'XLBV'
UNION ALL
SELECT '3899', 'EP'
UNION ALL
SELECT '3899', 'CAN'
UNION ALL
SELECT '3901', 'GC'
UNION ALL
SELECT '3901', 'MAI'
UNION ALL
SELECT '3901', 'DO'
UNION ALL
SELECT '3901', 'K2'
UNION ALL
SELECT '3913', 'GC'
UNION ALL
SELECT '3913', 'MAI'
UNION ALL
SELECT '3913', 'DO'
UNION ALL
SELECT '3913', 'K2'
UNION ALL
SELECT '3919', 'GC'
UNION ALL
SELECT '3919', 'MAI'
UNION ALL
SELECT '3919', 'DO'
UNION ALL
SELECT '3919', 'K2'
UNION ALL
SELECT '3922', 'GC'
UNION ALL
SELECT '3922', 'MAI'
UNION ALL
SELECT '3922', 'DO'
UNION ALL
SELECT '3922', 'K2'
UNION ALL
SELECT '3929', 'GC'
UNION ALL
SELECT '3929', 'MAI'
UNION ALL
SELECT '3929', 'DO'
UNION ALL
SELECT '3929', 'K2'
UNION ALL
SELECT '3930', 'GC'
UNION ALL
SELECT '3930', 'MAI'
UNION ALL
SELECT '3930', 'DO'
UNION ALL
SELECT '3930', 'K2'
UNION ALL
SELECT '3934', 'EP'
UNION ALL
SELECT '3935', 'EP'
UNION ALL
SELECT '3936', 'XLBV'
UNION ALL
SELECT '3942', 'XLBV'
UNION ALL
SELECT '3959', 'GC'
UNION ALL
SELECT '3959', 'MAI'
UNION ALL
SELECT '3959', 'DO'
UNION ALL
SELECT '3959', 'K2'
UNION ALL
SELECT '3960', 'GC'
UNION ALL
SELECT '3960', 'MAI'
UNION ALL
SELECT '3960', 'DO'
UNION ALL
SELECT '3960', 'K2'
UNION ALL
SELECT '3964', 'GC'
UNION ALL
SELECT '3964', 'MAI'
UNION ALL
SELECT '3964', 'DO'
UNION ALL
SELECT '3964', 'K2'
UNION ALL
SELECT '3968', 'GC'
UNION ALL
SELECT '3968', 'MAI'
UNION ALL
SELECT '3968', 'DO'
UNION ALL
SELECT '3968', 'K2'
UNION ALL
SELECT '3968', 'K1'
UNION ALL
SELECT '3971', 'GC'
UNION ALL
SELECT '3971', 'MAI'
UNION ALL
SELECT '3971', 'DO'
UNION ALL
SELECT '3971', 'K2'
UNION ALL
SELECT '3971', 'K1'
UNION ALL
SELECT '3973', 'K2'
UNION ALL
SELECT '3973', 'K1'
UNION ALL
SELECT '3974', 'MAI'
UNION ALL
SELECT '3974', 'DO'
UNION ALL
SELECT '3974', 'K2'
UNION ALL
SELECT '3974', 'K1'
UNION ALL
SELECT '3985', 'MAI'
UNION ALL
SELECT '3985', 'DO'
UNION ALL
SELECT '3985', 'K2'
UNION ALL
SELECT '3985', 'K1'
UNION ALL
SELECT '3990', 'GC'
UNION ALL
SELECT '3990', 'MAI'
UNION ALL
SELECT '3990', 'DO'
UNION ALL
SELECT '3990', 'K2'
UNION ALL
SELECT '3991', 'EP'
UNION ALL
SELECT '3996', 'GC'
UNION ALL
SELECT '3996', 'MAI'
UNION ALL
SELECT '3996', 'DO'
UNION ALL
SELECT '3996', 'K2'
UNION ALL
SELECT '4', 'XLBV'
UNION ALL
SELECT '4013', 'K2'
UNION ALL
SELECT '4013', 'K1'
UNION ALL
SELECT '4017', 'GC'
UNION ALL
SELECT '4017', 'MAI'
UNION ALL
SELECT '4017', 'DO'
UNION ALL
SELECT '4017', 'K2'
UNION ALL
SELECT '4019', 'GC'
UNION ALL
SELECT '4019', 'MAI'
UNION ALL
SELECT '4019', 'DO'
UNION ALL
SELECT '4019', 'K2'
UNION ALL
SELECT '4024', 'GC'
UNION ALL
SELECT '4024', 'MAI'
UNION ALL
SELECT '4024', 'DO'
UNION ALL
SELECT '4024', 'K2'
UNION ALL
SELECT '4031', 'GC'
UNION ALL
SELECT '4031', 'MAI'
UNION ALL
SELECT '4031', 'DO'
UNION ALL
SELECT '4031', 'K2'
UNION ALL
SELECT '4032', 'GC'
UNION ALL
SELECT '4032', 'MAI'
UNION ALL
SELECT '4032', 'DO'
UNION ALL
SELECT '4032', 'K2'
UNION ALL
SELECT '4033', 'GC'
UNION ALL
SELECT '4033', 'MAI'
UNION ALL
SELECT '4033', 'DO'
UNION ALL
SELECT '4033', 'K2'
UNION ALL
SELECT '4039', 'GC'
UNION ALL
SELECT '4039', 'MAI'
UNION ALL
SELECT '4039', 'DO'
UNION ALL
SELECT '4039', 'K2'
UNION ALL
SELECT '4041', 'GC'
UNION ALL
SELECT '4048', 'GC'
UNION ALL
SELECT '4048', 'MAI'
UNION ALL
SELECT '4048', 'DO'
UNION ALL
SELECT '4048', 'K2'
UNION ALL
SELECT '4052', 'MAI'
UNION ALL
SELECT '4052', 'DO'
UNION ALL
SELECT '4052', 'K2'
UNION ALL
SELECT '4052', 'K1'
UNION ALL
SELECT '4058', 'GC'
UNION ALL
SELECT '4058', 'MAI'
UNION ALL
SELECT '4058', 'DO'
UNION ALL
SELECT '4058', 'K2'
UNION ALL
SELECT '4070', 'GC'
UNION ALL
SELECT '4070', 'MAI'
UNION ALL
SELECT '4070', 'DO'
UNION ALL
SELECT '4070', 'K2'
UNION ALL
SELECT '4072', 'GC'
UNION ALL
SELECT '4072', 'MAI'
UNION ALL
SELECT '4072', 'DO'
UNION ALL
SELECT '4072', 'K2'
UNION ALL
SELECT '4073', 'GC'
UNION ALL
SELECT '4073', 'MAI'
UNION ALL
SELECT '4073', 'DO'
UNION ALL
SELECT '4073', 'K2'
UNION ALL
SELECT '4076', 'GC'
UNION ALL
SELECT '4079', 'GC'
UNION ALL
SELECT '4081', 'K1'
UNION ALL
SELECT '4083', 'GC'
UNION ALL
SELECT '4083', 'MAI'
UNION ALL
SELECT '4083', 'DO'
UNION ALL
SELECT '4083', 'K2'
UNION ALL
SELECT '4091', 'GC'
UNION ALL
SELECT '4093', 'GC'
UNION ALL
SELECT '4093', 'MAI'
UNION ALL
SELECT '4093', 'DO'
UNION ALL
SELECT '4093', 'K2'
UNION ALL
SELECT '4096', 'GC'
UNION ALL
SELECT '4097', 'MAI'
UNION ALL
SELECT '4097', 'DO'
UNION ALL
SELECT '4097', 'K1'
UNION ALL
SELECT '4102', 'GC'
UNION ALL
SELECT '4102', 'MAI'
UNION ALL
SELECT '4102', 'DO'
UNION ALL
SELECT '4102', 'K2'
UNION ALL
SELECT '4107', 'XLBV'
UNION ALL
SELECT '4108', 'XLBV'
UNION ALL
SELECT '4110', 'GC'
UNION ALL
SELECT '4110', 'MAI'
) AS s
JOIN workers w ON w.worker_code=s.worker_code
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code)) ;

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, p.id
FROM (
SELECT '4110' AS `worker_code`, 'DO' AS `process_code`
UNION ALL
SELECT '4110', 'K2'
UNION ALL
SELECT '4114', 'GC'
UNION ALL
SELECT '4114', 'MAI'
UNION ALL
SELECT '4114', 'DO'
UNION ALL
SELECT '4114', 'K2'
UNION ALL
SELECT '4115', 'GC'
UNION ALL
SELECT '4115', 'MAI'
UNION ALL
SELECT '4115', 'DO'
UNION ALL
SELECT '4115', 'K2'
UNION ALL
SELECT '4116', 'GC'
UNION ALL
SELECT '4116', 'MAI'
UNION ALL
SELECT '4116', 'DO'
UNION ALL
SELECT '4116', 'K2'
UNION ALL
SELECT '4117', 'GC'
UNION ALL
SELECT '4117', 'MAI'
UNION ALL
SELECT '4117', 'DO'
UNION ALL
SELECT '4117', 'K2'
UNION ALL
SELECT '4124', 'GC'
UNION ALL
SELECT '4124', 'MAI'
UNION ALL
SELECT '4124', 'DO'
UNION ALL
SELECT '4124', 'K2'
UNION ALL
SELECT '4126', 'GC'
UNION ALL
SELECT '4132', 'K1'
UNION ALL
SELECT '4132', 'XLBV'
UNION ALL
SELECT '4132', 'EP'
UNION ALL
SELECT '4132', 'CAN'
UNION ALL
SELECT '4144', 'XLBV'
UNION ALL
SELECT '4144', 'EP'
UNION ALL
SELECT '4144', 'CAN'
UNION ALL
SELECT '4150', 'XLBV'
UNION ALL
SELECT '4152', 'GC'
UNION ALL
SELECT '4152', 'MAI'
UNION ALL
SELECT '4152', 'DO'
UNION ALL
SELECT '4152', 'K2'
UNION ALL
SELECT '4155', 'GC'
UNION ALL
SELECT '4155', 'MAI'
UNION ALL
SELECT '4155', 'DO'
UNION ALL
SELECT '4155', 'K2'
UNION ALL
SELECT '416', 'GC'
UNION ALL
SELECT '416', 'MAI'
UNION ALL
SELECT '416', 'DO'
UNION ALL
SELECT '416', 'K2'
UNION ALL
SELECT '4162', 'GC'
UNION ALL
SELECT '4162', 'MAI'
UNION ALL
SELECT '4162', 'DO'
UNION ALL
SELECT '4162', 'K2'
UNION ALL
SELECT '4164', 'GC'
UNION ALL
SELECT '4166', 'GC'
UNION ALL
SELECT '4167', 'EP'
UNION ALL
SELECT '4167', 'CAN'
UNION ALL
SELECT '4169', 'XLBV'
UNION ALL
SELECT '4173', 'GC'
UNION ALL
SELECT '4173', 'MAI'
UNION ALL
SELECT '4173', 'DO'
UNION ALL
SELECT '4173', 'K2'
UNION ALL
SELECT '4174', 'GC'
UNION ALL
SELECT '4174', 'MAI'
UNION ALL
SELECT '4174', 'DO'
UNION ALL
SELECT '4174', 'K2'
UNION ALL
SELECT '4178', 'XLBV'
UNION ALL
SELECT '4180', 'XLBV'
UNION ALL
SELECT '4181', 'XLBV'
UNION ALL
SELECT '4182', 'XLBV'
UNION ALL
SELECT '4185', 'GC'
UNION ALL
SELECT '4185', 'MAI'
UNION ALL
SELECT '4185', 'DO'
UNION ALL
SELECT '4185', 'K2'
UNION ALL
SELECT '4197', 'GC'
UNION ALL
SELECT '4199', 'XLBV'
UNION ALL
SELECT '4201', 'EP'
UNION ALL
SELECT '4201', 'CAN'
UNION ALL
SELECT '4219', 'GC'
UNION ALL
SELECT '4219', 'MAI'
UNION ALL
SELECT '4219', 'DO'
UNION ALL
SELECT '4219', 'K2'
UNION ALL
SELECT '4220', 'GC'
UNION ALL
SELECT '4220', 'MAI'
UNION ALL
SELECT '4220', 'DO'
UNION ALL
SELECT '4220', 'K2'
UNION ALL
SELECT '4230', 'GC'
UNION ALL
SELECT '4232', 'EP'
UNION ALL
SELECT '4232', 'CAN'
UNION ALL
SELECT '4238', 'GC'
UNION ALL
SELECT '4238', 'MAI'
UNION ALL
SELECT '4238', 'DO'
UNION ALL
SELECT '4238', 'K2'
UNION ALL
SELECT '4241', 'GC'
UNION ALL
SELECT '4241', 'MAI'
UNION ALL
SELECT '4241', 'DO'
UNION ALL
SELECT '4241', 'K2'
UNION ALL
SELECT '4244', 'EP'
UNION ALL
SELECT '4244', 'CAN'
UNION ALL
SELECT '4248', 'MAI'
UNION ALL
SELECT '4248', 'DO'
UNION ALL
SELECT '4248', 'K2'
UNION ALL
SELECT '4249', 'GC'
UNION ALL
SELECT '4249', 'MAI'
UNION ALL
SELECT '4249', 'DO'
UNION ALL
SELECT '4249', 'K2'
UNION ALL
SELECT '4254', 'XLBV'
UNION ALL
SELECT '4257', 'GC'
UNION ALL
SELECT '4257', 'MAI'
UNION ALL
SELECT '4257', 'DO'
UNION ALL
SELECT '4257', 'K2'
UNION ALL
SELECT '4260', 'XLBV'
UNION ALL
SELECT '4269', 'XLBV'
UNION ALL
SELECT '4271', 'EP'
UNION ALL
SELECT '4271', 'CAN'
UNION ALL
SELECT '4275', 'EP'
UNION ALL
SELECT '4275', 'CAN'
UNION ALL
SELECT '4276', 'XLBV'
UNION ALL
SELECT '4277', 'K1'
UNION ALL
SELECT '4278', 'MAI'
UNION ALL
SELECT '4278', 'DO'
UNION ALL
SELECT '4278', 'K2'
UNION ALL
SELECT '4279', 'GC'
UNION ALL
SELECT '4279', 'MAI'
UNION ALL
SELECT '4279', 'DO'
UNION ALL
SELECT '4279', 'K2'
UNION ALL
SELECT '4280', 'GC'
UNION ALL
SELECT '4280', 'MAI'
UNION ALL
SELECT '4280', 'DO'
UNION ALL
SELECT '4280', 'K2'
UNION ALL
SELECT '4284', 'GC'
UNION ALL
SELECT '4284', 'MAI'
UNION ALL
SELECT '4284', 'DO'
UNION ALL
SELECT '4286', 'XLBV'
UNION ALL
SELECT '4290', 'MAI'
UNION ALL
SELECT '4290', 'DO'
UNION ALL
SELECT '4290', 'K1'
UNION ALL
SELECT '4291', 'GC'
UNION ALL
SELECT '4291', 'MAI'
UNION ALL
SELECT '4291', 'DO'
UNION ALL
SELECT '4291', 'K2'
UNION ALL
SELECT '4293', 'EP'
UNION ALL
SELECT '4293', 'CAN'
UNION ALL
SELECT '4294', 'XLBV'
UNION ALL
SELECT '4296', 'MAI'
UNION ALL
SELECT '4296', 'DO'
UNION ALL
SELECT '4296', 'K2'
UNION ALL
SELECT '4296', 'K1'
UNION ALL
SELECT '4301', 'EP'
UNION ALL
SELECT '4301', 'CAN'
UNION ALL
SELECT '4307', 'GC'
UNION ALL
SELECT '4307', 'MAI'
UNION ALL
SELECT '4307', 'DO'
UNION ALL
SELECT '4307', 'K2'
UNION ALL
SELECT '4313', 'MAI'
UNION ALL
SELECT '4313', 'DO'
UNION ALL
SELECT '4313', 'K2'
UNION ALL
SELECT '4313', 'K1'
UNION ALL
SELECT '4314', 'GC'
UNION ALL
SELECT '4315', 'EP'
UNION ALL
SELECT '4315', 'CAN'
UNION ALL
SELECT '4317', 'GC'
UNION ALL
SELECT '4318', 'GC'
UNION ALL
SELECT '4323', 'MAI'
UNION ALL
SELECT '4323', 'DO'
UNION ALL
SELECT '4323', 'K2'
UNION ALL
SELECT '4324', 'MAI'
UNION ALL
SELECT '4324', 'DO'
UNION ALL
SELECT '4324', 'K2'
UNION ALL
SELECT '4325', 'GC'
UNION ALL
SELECT '4325', 'MAI'
UNION ALL
SELECT '4325', 'DO'
UNION ALL
SELECT '4325', 'K2'
UNION ALL
SELECT '4326', 'EP'
UNION ALL
SELECT '4327', 'MAI'
UNION ALL
SELECT '4327', 'DO'
UNION ALL
SELECT '4327', 'K2'
UNION ALL
SELECT '4328', 'MAI'
UNION ALL
SELECT '4328', 'DO'
UNION ALL
SELECT '4328', 'K2'
UNION ALL
SELECT '4329', 'XLBV'
UNION ALL
SELECT '433', 'EP'
UNION ALL
SELECT '4330', 'EP'
UNION ALL
SELECT '4331', 'EP'
UNION ALL
SELECT '4332', 'MAI'
UNION ALL
SELECT '4332', 'DO'
) AS s
JOIN workers w ON w.worker_code=s.worker_code
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code)) ;

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, p.id
FROM (
SELECT '4332' AS `worker_code`, 'K2' AS `process_code`
UNION ALL
SELECT '4333', 'GC'
UNION ALL
SELECT '4333', 'MAI'
UNION ALL
SELECT '4333', 'DO'
UNION ALL
SELECT '4333', 'K2'
UNION ALL
SELECT '4334', 'MAI'
UNION ALL
SELECT '4334', 'DO'
UNION ALL
SELECT '4334', 'K2'
UNION ALL
SELECT '4335', 'GC'
UNION ALL
SELECT '4338', 'XLBV'
UNION ALL
SELECT '4340', 'MAI'
UNION ALL
SELECT '4340', 'DO'
UNION ALL
SELECT '4341', 'MAI'
UNION ALL
SELECT '4341', 'DO'
UNION ALL
SELECT '4342', 'GC'
UNION ALL
SELECT '4343', 'GC'
UNION ALL
SELECT '4344', 'GC'
UNION ALL
SELECT '4345', 'XLBV'
UNION ALL
SELECT '4346', 'GC'
UNION ALL
SELECT '4346', 'MAI'
UNION ALL
SELECT '4346', 'DO'
UNION ALL
SELECT '4346', 'K2'
UNION ALL
SELECT '4347', 'CAN'
UNION ALL
SELECT '4348', 'EP'
UNION ALL
SELECT '4349', 'CAN'
UNION ALL
SELECT '435', 'EP'
UNION ALL
SELECT '4350', 'EP'
UNION ALL
SELECT '4351', 'GC'
UNION ALL
SELECT '4352', 'GC'
UNION ALL
SELECT '4353', 'GC'
UNION ALL
SELECT '4354', 'CAN'
UNION ALL
SELECT '4355', 'EP'
UNION ALL
SELECT '4356', 'EP'
UNION ALL
SELECT '4357', 'EP'
UNION ALL
SELECT '4360', 'GC'
UNION ALL
SELECT '4361', 'K2'
UNION ALL
SELECT '4363', 'EP'
UNION ALL
SELECT '4364', 'K2'
UNION ALL
SELECT '4368', 'MAI'
UNION ALL
SELECT '4368', 'DO'
UNION ALL
SELECT '4368', 'K2'
UNION ALL
SELECT '4370', 'K2'
UNION ALL
SELECT '4373', 'K2'
UNION ALL
SELECT '4374', 'K2'
UNION ALL
SELECT '465', 'GC'
UNION ALL
SELECT '465', 'MAI'
UNION ALL
SELECT '465', 'DO'
UNION ALL
SELECT '465', 'K2'
UNION ALL
SELECT '489', 'GC'
UNION ALL
SELECT '489', 'MAI'
UNION ALL
SELECT '489', 'DO'
UNION ALL
SELECT '489', 'K2'
UNION ALL
SELECT '5', 'XLBV'
UNION ALL
SELECT '525', 'GC'
UNION ALL
SELECT '525', 'MAI'
UNION ALL
SELECT '525', 'DO'
UNION ALL
SELECT '525', 'K2'
UNION ALL
SELECT '526', 'GC'
UNION ALL
SELECT '526', 'MAI'
UNION ALL
SELECT '526', 'DO'
UNION ALL
SELECT '526', 'K2'
UNION ALL
SELECT '551', 'MAI'
UNION ALL
SELECT '551', 'DO'
UNION ALL
SELECT '551', 'K2'
UNION ALL
SELECT '560', 'XLBV'
UNION ALL
SELECT '561', 'XLBV'
UNION ALL
SELECT '562', 'MAI'
UNION ALL
SELECT '562', 'DO'
UNION ALL
SELECT '562', 'K2'
UNION ALL
SELECT '562', 'K1'
UNION ALL
SELECT '582', 'EP'
UNION ALL
SELECT '590', 'MAI'
UNION ALL
SELECT '590', 'DO'
UNION ALL
SELECT '590', 'K2'
UNION ALL
SELECT '591', 'GC'
UNION ALL
SELECT '591', 'MAI'
UNION ALL
SELECT '591', 'DO'
UNION ALL
SELECT '591', 'K2'
UNION ALL
SELECT '599', 'GC'
UNION ALL
SELECT '602', 'EP'
UNION ALL
SELECT '606', 'EP'
UNION ALL
SELECT '613', 'MAI'
UNION ALL
SELECT '613', 'DO'
UNION ALL
SELECT '613', 'K2'
UNION ALL
SELECT '62', 'EP'
UNION ALL
SELECT '625', 'MAI'
UNION ALL
SELECT '625', 'DO'
UNION ALL
SELECT '625', 'K2'
UNION ALL
SELECT '625', 'K1'
UNION ALL
SELECT '63', 'EP'
UNION ALL
SELECT '632', 'GC'
UNION ALL
SELECT '632', 'MAI'
UNION ALL
SELECT '632', 'DO'
UNION ALL
SELECT '632', 'K2'
UNION ALL
SELECT '639', 'MAI'
UNION ALL
SELECT '639', 'DO'
UNION ALL
SELECT '639', 'K2'
UNION ALL
SELECT '640', 'GC'
UNION ALL
SELECT '640', 'MAI'
UNION ALL
SELECT '640', 'DO'
UNION ALL
SELECT '640', 'K2'
UNION ALL
SELECT '641', 'GC'
UNION ALL
SELECT '641', 'MAI'
UNION ALL
SELECT '641', 'DO'
UNION ALL
SELECT '641', 'K2'
UNION ALL
SELECT '642', 'MAI'
UNION ALL
SELECT '642', 'DO'
UNION ALL
SELECT '642', 'K2'
UNION ALL
SELECT '643', 'GC'
UNION ALL
SELECT '643', 'MAI'
UNION ALL
SELECT '643', 'DO'
UNION ALL
SELECT '643', 'K2'
UNION ALL
SELECT '644', 'GC'
UNION ALL
SELECT '644', 'MAI'
UNION ALL
SELECT '644', 'DO'
UNION ALL
SELECT '644', 'K2'
UNION ALL
SELECT '646', 'GC'
UNION ALL
SELECT '646', 'MAI'
UNION ALL
SELECT '646', 'DO'
UNION ALL
SELECT '646', 'K2'
UNION ALL
SELECT '647', 'MAI'
UNION ALL
SELECT '647', 'DO'
UNION ALL
SELECT '647', 'K2'
UNION ALL
SELECT '648', 'MAI'
UNION ALL
SELECT '648', 'DO'
UNION ALL
SELECT '648', 'K2'
UNION ALL
SELECT '649', 'MAI'
UNION ALL
SELECT '649', 'DO'
UNION ALL
SELECT '649', 'K2'
UNION ALL
SELECT '651', 'MAI'
UNION ALL
SELECT '651', 'DO'
UNION ALL
SELECT '651', 'K2'
UNION ALL
SELECT '655', 'GC'
UNION ALL
SELECT '655', 'MAI'
UNION ALL
SELECT '655', 'DO'
UNION ALL
SELECT '655', 'K2'
UNION ALL
SELECT '656', 'GC'
UNION ALL
SELECT '656', 'MAI'
UNION ALL
SELECT '656', 'DO'
UNION ALL
SELECT '656', 'K2'
UNION ALL
SELECT '657', 'MAI'
UNION ALL
SELECT '657', 'DO'
UNION ALL
SELECT '657', 'K2'
UNION ALL
SELECT '658', 'MAI'
UNION ALL
SELECT '658', 'DO'
UNION ALL
SELECT '658', 'K2'
UNION ALL
SELECT '659', 'EP'
UNION ALL
SELECT '66', 'EP'
UNION ALL
SELECT '661', 'MAI'
UNION ALL
SELECT '661', 'DO'
UNION ALL
SELECT '661', 'K2'
UNION ALL
SELECT '666', 'MAI'
UNION ALL
SELECT '666', 'DO'
UNION ALL
SELECT '666', 'K2'
UNION ALL
SELECT '668', 'MAI'
UNION ALL
SELECT '668', 'DO'
UNION ALL
SELECT '668', 'K2'
UNION ALL
SELECT '669', 'MAI'
UNION ALL
SELECT '669', 'DO'
UNION ALL
SELECT '669', 'K2'
UNION ALL
SELECT '67', 'EP'
UNION ALL
SELECT '670', 'MAI'
UNION ALL
SELECT '670', 'DO'
UNION ALL
SELECT '670', 'K2'
UNION ALL
SELECT '671', 'MAI'
UNION ALL
SELECT '671', 'DO'
UNION ALL
SELECT '671', 'K2'
UNION ALL
SELECT '672', 'MAI'
UNION ALL
SELECT '672', 'DO'
UNION ALL
SELECT '672', 'K2'
UNION ALL
SELECT '673', 'MAI'
UNION ALL
SELECT '673', 'DO'
UNION ALL
SELECT '673', 'K2'
UNION ALL
SELECT '674', 'MAI'
UNION ALL
SELECT '674', 'DO'
UNION ALL
SELECT '674', 'K2'
UNION ALL
SELECT '675', 'MAI'
UNION ALL
SELECT '675', 'DO'
UNION ALL
SELECT '675', 'K2'
UNION ALL
SELECT '676', 'GC'
) AS s
JOIN workers w ON w.worker_code=s.worker_code
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code)) ;

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, p.id
FROM (
SELECT '676' AS `worker_code`, 'MAI' AS `process_code`
UNION ALL
SELECT '676', 'DO'
UNION ALL
SELECT '676', 'K2'
UNION ALL
SELECT '679', 'K2'
UNION ALL
SELECT '68', 'EP'
UNION ALL
SELECT '681', 'MAI'
UNION ALL
SELECT '681', 'DO'
UNION ALL
SELECT '681', 'K2'
UNION ALL
SELECT '682', 'MAI'
UNION ALL
SELECT '682', 'DO'
UNION ALL
SELECT '682', 'K2'
UNION ALL
SELECT '684', 'MAI'
UNION ALL
SELECT '684', 'DO'
UNION ALL
SELECT '685', 'MAI'
UNION ALL
SELECT '685', 'DO'
UNION ALL
SELECT '685', 'K2'
UNION ALL
SELECT '686', 'MAI'
UNION ALL
SELECT '686', 'DO'
UNION ALL
SELECT '686', 'K2'
UNION ALL
SELECT '71', 'GC'
UNION ALL
SELECT '71', 'MAI'
UNION ALL
SELECT '71', 'DO'
UNION ALL
SELECT '71', 'K2'
UNION ALL
SELECT '72', 'EP'
UNION ALL
SELECT '74', 'K2'
UNION ALL
SELECT '748', 'MAI'
UNION ALL
SELECT '748', 'DO'
UNION ALL
SELECT '748', 'K2'
UNION ALL
SELECT '761', 'GC'
UNION ALL
SELECT '761', 'MAI'
UNION ALL
SELECT '761', 'DO'
UNION ALL
SELECT '762', 'GC'
UNION ALL
SELECT '763', 'GC'
UNION ALL
SELECT '764', 'GC'
UNION ALL
SELECT '764', 'MAI'
UNION ALL
SELECT '764', 'DO'
UNION ALL
SELECT '765', 'MAI'
UNION ALL
SELECT '765', 'DO'
UNION ALL
SELECT '766', 'MAI'
UNION ALL
SELECT '766', 'DO'
UNION ALL
SELECT '800', 'GC'
UNION ALL
SELECT '800', 'MAI'
UNION ALL
SELECT '800', 'DO'
UNION ALL
SELECT '800', 'K2'
UNION ALL
SELECT '82', 'EP'
UNION ALL
SELECT '83', 'EP'
UNION ALL
SELECT '909', 'XLBV'
UNION ALL
SELECT '92', 'EP'
UNION ALL
SELECT '93', 'K1'
UNION ALL
SELECT '94', 'K1'
UNION ALL
SELECT '94', 'EP'
UNION ALL
SELECT '95', 'EP'
UNION ALL
SELECT '958', 'GC'
UNION ALL
SELECT '958', 'MAI'
UNION ALL
SELECT '958', 'DO'
UNION ALL
SELECT '958', 'K2'
UNION ALL
SELECT '96', 'K1'
UNION ALL
SELECT '96', 'EP'
UNION ALL
SELECT '97', 'EP'
UNION ALL
SELECT '98', 'EP'
UNION ALL
SELECT 'HS004', 'GC'
UNION ALL
SELECT 'HS025', 'GC'
UNION ALL
SELECT 'HS078', 'GC'
UNION ALL
SELECT 'HS081', 'GC'
UNION ALL
SELECT 'K015', 'EP'
UNION ALL
SELECT 'K091', 'MAI'
UNION ALL
SELECT 'K091', 'DO'
UNION ALL
SELECT 'K092', 'MAI'
UNION ALL
SELECT 'K092', 'DO'
UNION ALL
SELECT 'K100', 'K2'
UNION ALL
SELECT 'K101', 'K2'
UNION ALL
SELECT 'K102', 'K2'
UNION ALL
SELECT 'K103', 'K2'
UNION ALL
SELECT 'P599', 'MAI'
UNION ALL
SELECT 'P599', 'DO'
UNION ALL
SELECT 'P599', 'K2'
UNION ALL
SELECT 'V2278', 'GC'
UNION ALL
SELECT 'V2278', 'K2'
UNION ALL
SELECT 'V748', 'K2'
UNION ALL
SELECT 'VH10-158', 'K2'
UNION ALL
SELECT 'VH7-010', 'MAI'
UNION ALL
SELECT 'VH7-010', 'DO'
UNION ALL
SELECT 'VH7-012', 'GC'
UNION ALL
SELECT 'VH7-019', 'GC'
UNION ALL
SELECT 'VH7-027', 'GC'
UNION ALL
SELECT 'VH7-028', 'GC'
UNION ALL
SELECT 'VH8-067', 'MAI'
UNION ALL
SELECT 'VH8-067', 'DO'
UNION ALL
SELECT 'VH8-162', 'K2'
UNION ALL
SELECT 'VH8-43', 'K2'
UNION ALL
SELECT 'VH8-44', 'K2'
UNION ALL
SELECT 'VH8-48', 'K2'
UNION ALL
SELECT 'VH8-49', 'GC'
UNION ALL
SELECT 'VH8-52', 'GC'
UNION ALL
SELECT 'VH8-53', 'K2'
UNION ALL
SELECT 'VH8-56', 'K2'
UNION ALL
SELECT 'VH8-58', 'K2'
UNION ALL
SELECT 'VH8-63', 'GC'
UNION ALL
SELECT 'VH8-70', 'GC'
UNION ALL
SELECT 'VH8-73', 'K2'
UNION ALL
SELECT 'VH8-81', 'K2'
UNION ALL
SELECT 'VH9-090', 'K2'
UNION ALL
SELECT 'VH9-091', 'K2'
UNION ALL
SELECT 'VH9-099', 'GC'
UNION ALL
SELECT 'VH9-099', 'K2'
UNION ALL
SELECT 'VH9-100', 'K2'
UNION ALL
SELECT 'VH9-103', 'K2'
UNION ALL
SELECT 'VH9-104', 'GC'
UNION ALL
SELECT 'VH9-104', 'K2'
UNION ALL
SELECT 'VH9-105', 'K2'
UNION ALL
SELECT 'VH9-107', 'K2'
UNION ALL
SELECT 'VH9-111', 'K2'
UNION ALL
SELECT 'VH9-112', 'K2'
UNION ALL
SELECT 'VH9-123', 'K2'
UNION ALL
SELECT 'VH9-124', 'MAI'
UNION ALL
SELECT 'VH9-124', 'DO'
UNION ALL
SELECT 'VH9-93', 'MAI'
UNION ALL
SELECT 'VH9-93', 'DO'
UNION ALL
SELECT 'h101', 'GC'
UNION ALL
SELECT 'h110', 'GC'
UNION ALL
SELECT 'h114', 'GC'
UNION ALL
SELECT 'h116', 'GC'
UNION ALL
SELECT 'h117', 'GC'
UNION ALL
SELECT 'h118', 'GC'
UNION ALL
SELECT 'h120', 'GC'
UNION ALL
SELECT 'h121', 'GC'
UNION ALL
SELECT 'h122', 'GC'
UNION ALL
SELECT 'h22', 'GC'
UNION ALL
SELECT 'h23', 'GC'
UNION ALL
SELECT 'h30', 'GC'
UNION ALL
SELECT 'h31', 'GC'
UNION ALL
SELECT 'h36', 'GC'
UNION ALL
SELECT 'h37', 'GC'
UNION ALL
SELECT 'h41', 'GC'
UNION ALL
SELECT 'h42', 'GC'
UNION ALL
SELECT 'h7', 'GC'
UNION ALL
SELECT 'hs002', 'MAI'
UNION ALL
SELECT 'hs002', 'DO'
UNION ALL
SELECT 'hs003', 'MAI'
UNION ALL
SELECT 'hs003', 'DO'
UNION ALL
SELECT 'hs006', 'K2'
UNION ALL
SELECT 'hs008', 'MAI'
UNION ALL
SELECT 'hs008', 'DO'
UNION ALL
SELECT 'hs009', 'MAI'
UNION ALL
SELECT 'hs009', 'DO'
UNION ALL
SELECT 'hs014', 'MAI'
UNION ALL
SELECT 'hs014', 'DO'
UNION ALL
SELECT 'hs014', 'K2'
UNION ALL
SELECT 'hs015', 'MAI'
UNION ALL
SELECT 'hs015', 'DO'
UNION ALL
SELECT 'hs017', 'MAI'
UNION ALL
SELECT 'hs017', 'DO'
UNION ALL
SELECT 'hs017', 'K2'
UNION ALL
SELECT 'hs018', 'MAI'
UNION ALL
SELECT 'hs018', 'DO'
UNION ALL
SELECT 'hs021', 'MAI'
UNION ALL
SELECT 'hs021', 'DO'
UNION ALL
SELECT 'hs024', 'MAI'
UNION ALL
SELECT 'hs024', 'DO'
UNION ALL
SELECT 'hs024', 'K2'
UNION ALL
SELECT 'hs026', 'MAI'
UNION ALL
SELECT 'hs026', 'DO'
UNION ALL
SELECT 'hs033', 'MAI'
UNION ALL
SELECT 'hs033', 'DO'
UNION ALL
SELECT 'hs034', 'MAI'
UNION ALL
SELECT 'hs034', 'DO'
UNION ALL
SELECT 'hs038', 'MAI'
UNION ALL
SELECT 'hs038', 'DO'
UNION ALL
SELECT 'hs046', 'MAI'
UNION ALL
SELECT 'hs054', 'MAI'
UNION ALL
SELECT 'hs054', 'DO'
UNION ALL
SELECT 'hs057', 'MAI'
UNION ALL
SELECT 'hs057', 'DO'
UNION ALL
SELECT 'hs061', 'MAI'
UNION ALL
SELECT 'hs061', 'DO'
UNION ALL
SELECT 'hs062', 'MAI'
UNION ALL
SELECT 'hs062', 'DO'
UNION ALL
SELECT 'hs074', 'MAI'
UNION ALL
SELECT 'hs074', 'DO'
UNION ALL
SELECT 'hs076', 'MAI'
) AS s
JOIN workers w ON w.worker_code=s.worker_code
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code)) ;

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, p.id
FROM (
SELECT 'hs076' AS `worker_code`, 'DO' AS `process_code`
UNION ALL
SELECT 'hs077', 'MAI'
UNION ALL
SELECT 'hs077', 'DO'
UNION ALL
SELECT 'hs079', 'MAI'
UNION ALL
SELECT 'hs079', 'DO'
UNION ALL
SELECT 'hs083', 'MAI'
UNION ALL
SELECT 'hs083', 'DO'
UNION ALL
SELECT 'hs085', 'MAI'
UNION ALL
SELECT 'hs085', 'DO'
UNION ALL
SELECT 'hs097', 'K2'
UNION ALL
SELECT 'hs098', 'K2'
UNION ALL
SELECT 'hs113', 'K2'
UNION ALL
SELECT 'hs115', 'K2'
UNION ALL
SELECT 'hs125', 'K2'
UNION ALL
SELECT 'hs126', 'K2'
UNION ALL
SELECT 'hs127', 'K2'
UNION ALL
SELECT 'hs129', 'K2'
UNION ALL
SELECT 'hs130', 'K2'
UNION ALL
SELECT 'hs134', 'K2'
UNION ALL
SELECT 'hs135', 'K2'
UNION ALL
SELECT 'hs137', 'K2'
UNION ALL
SELECT 'hs138', 'K2'
UNION ALL
SELECT 'hs141', 'K2'
UNION ALL
SELECT 'hs145', 'MAI'
UNION ALL
SELECT 'hs145', 'DO'
UNION ALL
SELECT 'hs146', 'K2'
UNION ALL
SELECT 'hs151', 'MAI'
UNION ALL
SELECT 'hs151', 'DO'
UNION ALL
SELECT 'hs156', 'MAI'
UNION ALL
SELECT 'hs156', 'DO'
UNION ALL
SELECT 'k010', 'GC'
UNION ALL
SELECT 'k104', 'K2'
UNION ALL
SELECT 'k133', 'GC'
UNION ALL
SELECT 'k136', 'GC'
UNION ALL
SELECT 'k139', 'GC'
UNION ALL
SELECT 'k144', 'GC'
UNION ALL
SELECT 'k148', 'GC'
UNION ALL
SELECT 'k149', 'GC'
UNION ALL
SELECT 'k155', 'GC'
UNION ALL
SELECT 'k157', 'GC'
UNION ALL
SELECT 'k160', 'GC'
UNION ALL
SELECT 'k164', 'GC'
UNION ALL
SELECT 'k45', 'GC'
UNION ALL
SELECT 'k46', 'GC'
UNION ALL
SELECT 'k47', 'GC'
UNION ALL
SELECT 'k50', 'GC'
UNION ALL
SELECT 'k64', 'GC'
UNION ALL
SELECT 'k66', 'GC'
UNION ALL
SELECT 'k68', 'GC'
UNION ALL
SELECT 'k69', 'GC'
UNION ALL
SELECT 'k71', 'GC'
UNION ALL
SELECT 'k72', 'GC'
UNION ALL
SELECT 'k74', 'GC'
UNION ALL
SELECT 'k78', 'GC'
UNION ALL
SELECT 'k80', 'GC'
UNION ALL
SELECT 'k82', 'GC'
UNION ALL
SELECT 'k84', 'GC'
UNION ALL
SELECT 'k87', 'GC'
UNION ALL
SELECT 't-551', 'GC'
UNION ALL
SELECT 'v1134', 'GC'
UNION ALL
SELECT 'v1134', 'K2'
UNION ALL
SELECT 'v1333', 'K2'
UNION ALL
SELECT 'v1448', 'GC'
UNION ALL
SELECT 'v1448', 'K2'
UNION ALL
SELECT 'v1572', 'GC'
UNION ALL
SELECT 'v1572', 'K2'
UNION ALL
SELECT 'v2284', 'GC'
UNION ALL
SELECT 'v2284', 'K2'
UNION ALL
SELECT 'v2564', 'K2'
UNION ALL
SELECT 'v2984', 'GC'
UNION ALL
SELECT 'v3046', 'GC'
UNION ALL
SELECT 'v3046', 'K2'
UNION ALL
SELECT 'v3263', 'GC'
UNION ALL
SELECT 'v3263', 'K2'
UNION ALL
SELECT 'v3351', 'GC'
UNION ALL
SELECT 'v3351', 'K2'
UNION ALL
SELECT 'v3607', 'GC'
UNION ALL
SELECT 'v3607', 'K2'
UNION ALL
SELECT 'v3622', 'GC'
UNION ALL
SELECT 'v3971', 'K2'
UNION ALL
SELECT 'v4083', 'K2'
UNION ALL
SELECT 'v416', 'GC'
UNION ALL
SELECT 'v416', 'K2'
UNION ALL
SELECT 'v4162', 'GC'
) AS s
JOIN workers w ON w.worker_code=s.worker_code
JOIN processes p ON UPPER(TRIM(p.process_code))=UPPER(TRIM(s.process_code)) ;

-- ============================================================================
-- 11. CÔNG THỨC VÀ NGƯỠNG
-- ============================================================================
INSERT INTO production_formula_settings
(scope_code, process_id, apply_training_percent, output_formula, output_per_hour_formula, achievement_formula, ng_rate_formula, actual_time_formula, threshold_red, threshold_orange, threshold_yellow, threshold_green)
VALUES ('GLOBAL', NULL, 1, 'ENTERED_X_TRAINING', 'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME', 'OUTPUT_PER_HOUR_DIV_STANDARD', 'NG_DIV_OK_PLUS_NG', 'DATABASE_SNAPSHOT', 80, 95, 100, 110)
ON DUPLICATE KEY UPDATE apply_training_percent=VALUES(apply_training_percent), output_formula=VALUES(output_formula), output_per_hour_formula=VALUES(output_per_hour_formula), achievement_formula=VALUES(achievement_formula), ng_rate_formula=VALUES(ng_rate_formula), actual_time_formula=VALUES(actual_time_formula), threshold_red=VALUES(threshold_red), threshold_orange=VALUES(threshold_orange), threshold_yellow=VALUES(threshold_yellow), threshold_green=VALUES(threshold_green);

-- ============================================================================
-- 12. GHI NHẬN SEED
-- ============================================================================
INSERT INTO master_seed_runs (seed_key, source_file, source_sha256, summary_json) VALUES ('KTC_MAU_GOC_V1', 'file mẫu(5).xlsx', '0aab63bffa213f335d06326231baa9a395455ab73d1aa19e0ef37182984704a4', '{"processes": 9, "workers": 593, "machines": 115, "aliases": 769, "variants": 2019, "canonical": 2014, "deductions": 135, "defects": 135, "assignments": 1344, "formulaSettings": 1}') ON DUPLICATE KEY UPDATE source_file=VALUES(source_file), source_sha256=VALUES(source_sha256), summary_json=VALUES(summary_json), updated_at=CURRENT_TIMESTAMP;

-- ============================================================================
-- 13. KIỂM TRA SAU KHI CHẠY
-- ============================================================================
SELECT 'Công đoạn' AS nhom, COUNT(*) AS so_luong FROM processes
UNION ALL SELECT 'Công nhân', COUNT(*) FROM workers
UNION ALL SELECT 'Máy', COUNT(*) FROM machines
UNION ALL SELECT 'Phân công', COUNT(*) FROM worker_processes
UNION ALL SELECT 'Ánh xạ sản phẩm', COUNT(*) FROM product_aliases
UNION ALL SELECT 'Định mức biến thể', COUNT(*) FROM product_standard_variants
UNION ALL SELECT 'Định mức đang dùng', COUNT(*) FROM product_standards
UNION ALL SELECT 'Trừ giờ', COUNT(*) FROM deduction_types
UNION ALL SELECT 'Lỗi NG', COUNT(*) FROM defect_types
UNION ALL SELECT 'Lần seed', COUNT(*) FROM master_seed_runs;

-- ==================== 012_factory_machine_rules_20260810.sql ====================
-- KTC 012 - Quy tắc máy theo thực tế xưởng ngày 10/08/2026.
-- An toàn khi chạy lại; không xóa báo cáo sản xuất.


-- Mặc định mọi máy: máy thường, 1 người/máy, sản lượng theo sản phẩm.
UPDATE machines SET
  is_automatic = COALESCE(is_automatic, 0),
  max_workers_per_machine = CASE WHEN max_workers_per_machine IS NULL OR max_workers_per_machine < 1 THEN 1 ELSE max_workers_per_machine END,
  output_basis = CASE WHEN output_basis IS NULL OR output_basis = '' THEN 'PRODUCT' ELSE UPPER(output_basis) END;

-- Quy tắc riêng Gia công/Cắt-Lồng. Chỉ áp dụng các mã máy dạng số/cách ghi rõ ràng,
-- không match nhầm các mã sản phẩm/mã máy kiểu c2556-11.
UPDATE machines m JOIN processes p ON p.id = m.process_id
SET m.is_automatic = 1, m.output_basis = 'MACHINE'
WHERE p.process_code = 'GC' AND UPPER(REPLACE(REPLACE(TRIM(m.machine_code),' ',''),'MÁY','MAY')) IN
('1','01','M1','M01','MAY1','MAY01','MAY-1','MACHINE1','MACHINE-1',
 '2','02','M2','M02','MAY2','MAY02','MAY-2','MACHINE2','MACHINE-2',
 '3','03','M3','M03','MAY3','MAY03','MAY-3','MACHINE3','MACHINE-3',
 '4','04','M4','M04','MAY4','MAY04','MAY-4','MACHINE4','MACHINE-4',
 '8','08','M8','M08','MAY8','MAY08','MAY-8','MACHINE8','MACHINE-8',
 '9','09','M9','M09','MAY9','MAY09','MAY-9','MACHINE9','MACHINE-9',
 '10','M10','MAY10','MAY-10','MACHINE10','MACHINE-10',
 '11','M11','MAY11','MAY-11','MACHINE11','MACHINE-11',
 '14','M14','MAY14','MAY-14','MACHINE14','MACHINE-14',
 '16','M16','MAY16','MAY-16','MACHINE16','MACHINE-16',
 '17','M17','MAY17','MAY-17','MACHINE17','MACHINE-17',
 '23','M23','MAY23','MAY-23','MACHINE23','MACHINE-23',
 '24','M24','MAY24','MAY-24','MACHINE24','MACHINE-24',
 '25','M25','MAY25','MAY-25','MACHINE25','MACHINE-25',
 '26','M26','MAY26','MAY-26','MACHINE26','MACHINE-26');

UPDATE machines m JOIN processes p ON p.id = m.process_id
SET m.max_workers_per_machine = 4, m.output_basis = 'MACHINE'
WHERE p.process_code = 'GC' AND UPPER(REPLACE(REPLACE(TRIM(m.machine_code),' ',''),'MÁY','MAY')) IN
('5','05','M5','M05','MAY5','MAY05','MAY-5','MACHINE5','MACHINE-5',
 '6','06','M6','M06','MAY6','MAY06','MAY-6','MACHINE6','MACHINE-6',
 '7','07','M7','M07','MAY7','MAY07','MAY-7','MACHINE7','MACHINE-7',
 '11','M11','MAY11','MAY-11','MACHINE11','MACHINE-11');

-- Đo và Ép bắt buộc 1 người/1 máy; Kiểm cũng tối đa 1 người/máy.
UPDATE machines m JOIN processes p ON p.id = m.process_id
SET m.max_workers_per_machine = 1
WHERE p.process_code IN ('DO','EP','K1','K2','CAN');


-- ==================== 013_book2_machine_product_time_20260810.sql ====================
-- KTC 013 - Sản lượng máy theo sản phẩm + thời gian chạy từ Book2(3).xlsx.
-- Book2 cung cấp định mức chi tiết cho Mài: mã sản phẩm, số máy, thời gian chuẩn và năng suất/giờ.
-- Hai xung đột QC4-6262 trên máy 3 và 5 được giữ đầy đủ trong bảng biến thể; bản dòng nguồn lớn hơn được chọn làm bản đang dùng.


CREATE TABLE IF NOT EXISTS product_machine_standard_variants (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  product_code VARCHAR(180) NOT NULL,
  machine_code VARCHAR(100) NOT NULL,
  standard_time_seconds DECIMAL(18,6) NOT NULL,
  calculated_output_per_hour DECIMAL(18,6) NOT NULL,
  source_name VARCHAR(120) NOT NULL,
  source_sheet VARCHAR(120) NOT NULL,
  source_row_number INT NOT NULL,
  source_note TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pms_variant_source (process_id, product_code, machine_code, source_name, source_row_number),
  KEY idx_pms_variant_lookup (process_id, product_code, machine_code, is_active)
);

UPDATE machines m JOIN processes p ON p.id=m.process_id SET m.output_basis='MACHINE' WHERE p.process_code='GC' AND (m.is_automatic=1 OR TRIM(m.machine_code) IN ('5','6','7','11'));

-- Bổ sung mã sản phẩm Mài từ Book2 nếu master cũ chưa có. Đây chỉ là fallback; khi có định mức máy thì luôn ưu tiên định mức máy.
INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, 'MÀI - BOOK2', src.product_code, MAX(src.output_per_hour), 0, 'active'
FROM processes p JOIN (
SELECT '30375120' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT '625542421' AS product_code, 163.636364 AS output_per_hour
UNION ALL
SELECT '625542431' AS product_code, 200.000000 AS output_per_hour
UNION ALL
SELECT '625543311' AS product_code, 200.000000 AS output_per_hour
UNION ALL
SELECT '6A3-0977' AS product_code, 90.000000 AS output_per_hour
UNION ALL
SELECT 'D0006E' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'D000PK' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'D0015U' AS product_code, 65.454545 AS output_per_hour
UNION ALL
SELECT 'D0016D' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'D0016H' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'D0016M' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'DOO2SS' AS product_code, 225.000000 AS output_per_hour
UNION ALL
SELECT 'Fl4-5091' AS product_code, 80.000000 AS output_per_hour
UNION ALL
SELECT 'Fl4-5092' AS product_code, 80.000000 AS output_per_hour
UNION ALL
SELECT 'LEH123' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'LEH125' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'LF5243' AS product_code, 60.000000 AS output_per_hour
UNION ALL
SELECT 'LY9276' AS product_code, 360.000000 AS output_per_hour
UNION ALL
SELECT 'MA3-0575' AS product_code, 105.882353 AS output_per_hour
UNION ALL
SELECT 'P10255004' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P27678011' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P28596001' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P32679023' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P45840001' AS product_code, 65.454545 AS output_per_hour
UNION ALL
SELECT 'P49746004' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P57049906' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P57692402' AS product_code, 69.230769 AS output_per_hour
UNION ALL
SELECT 'P58966900' AS product_code, 65.454545 AS output_per_hour
UNION ALL
SELECT 'P62830603' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P66869902' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'QC2-9149' AS product_code, 360.000000 AS output_per_hour
UNION ALL
SELECT 'QC3-2556' AS product_code, 257.142857 AS output_per_hour
UNION ALL
SELECT 'QC3-2801' AS product_code, 257.142857 AS output_per_hour
UNION ALL
SELECT 'QC4-2821' AS product_code, 138.461538 AS output_per_hour
UNION ALL
SELECT 'QC4-2822' AS product_code, 124.137931 AS output_per_hour
UNION ALL
SELECT 'QC4-6262' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC4-7133' AS product_code, 276.923077 AS output_per_hour
UNION ALL
SELECT 'QC4-7630' AS product_code, 78.260870 AS output_per_hour
UNION ALL
SELECT 'QC4-7960' AS product_code, 276.923077 AS output_per_hour
UNION ALL
SELECT 'QC4-8484' AS product_code, 138.461538 AS output_per_hour
UNION ALL
SELECT 'QC4-8485' AS product_code, 124.137931 AS output_per_hour
UNION ALL
SELECT 'QC5-1030' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-1080' AS product_code, 240.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-1090' AS product_code, 128.571429 AS output_per_hour
UNION ALL
SELECT 'QC5-1657' AS product_code, 45.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-1660' AS product_code, 45.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-3033' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-3438' AS product_code, 360.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-3880' AS product_code, 276.923077 AS output_per_hour
UNION ALL
SELECT 'QC5-5770' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-5861' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-9565' AS product_code, 120.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-9740' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC6-4563' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC6-6773' AS product_code, 15.000000 AS output_per_hour
UNION ALL
SELECT 'QC6-8234' AS product_code, 138.461538 AS output_per_hour
UNION ALL
SELECT 'QC6-8235' AS product_code, 138.461538 AS output_per_hour
UNION ALL
SELECT 'QC7-0598' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6270' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6485' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6486' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6487' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6488' AS product_code, 128.571429 AS output_per_hour
UNION ALL
SELECT 'QC7-6489' AS product_code, 128.571429 AS output_per_hour
UNION ALL
SELECT 'QC7-6490' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6491' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6492' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6493' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6494' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6495' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-9477' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-1467' AS product_code, 24.657534 AS output_per_hour
UNION ALL
SELECT 'QC8-1470' AS product_code, 24.657534 AS output_per_hour
UNION ALL
SELECT 'QC8-6240' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-6242' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-6328' AS product_code, 45.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-6330' AS product_code, 45.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-6420' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-9503' AS product_code, 90.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-9520' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-9968' AS product_code, 300.000000 AS output_per_hour
) src ON 1=1 WHERE p.process_code='MAI' GROUP BY p.id, src.product_code
ON DUPLICATE KEY UPDATE product_code=VALUES(product_code);

INSERT INTO product_machine_standard_variants (process_id,product_code,machine_code,standard_time_seconds,calculated_output_per_hour,source_name,source_sheet,source_row_number,source_note,is_active)
SELECT p.id,src.product_code,src.machine_code,src.standard_time_seconds,src.output_per_hour,'Book2(3).xlsx','Máy',src.source_row,src.source_note,1 FROM processes p JOIN (
SELECT 'QC5-1657' product_code,'21' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,8 source_row,'540s-570s' source_note
UNION ALL
SELECT 'QC5-1657' product_code,'22' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,8 source_row,'540s-570s' source_note
UNION ALL
SELECT 'QC5-1660' product_code,'21' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,9 source_row,'540s-570s' source_note
UNION ALL
SELECT 'QC5-1660' product_code,'22' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,9 source_row,'540s-570s' source_note
UNION ALL
SELECT 'QC5-1657' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,10 source_row,'Mài 2 khoảng\nmỗi khoảng 2 lần\nLần 1:40s\nLần 2 :40s' source_note
UNION ALL
SELECT 'QC5-1657' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,10 source_row,'Mài 2 khoảng\nmỗi khoảng 2 lần\nLần 1:40s\nLần 2 :40s' source_note
UNION ALL
SELECT 'QC5-1660' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,11 source_row,'Mài 2 khoảng\nmỗi khoảng 2 lần\nLần 1:40s\nLần 2 :40s' source_note
UNION ALL
SELECT 'QC5-1660' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,11 source_row,'Mài 2 khoảng\nmỗi khoảng 2 lần\nLần 1:40s\nLần 2 :40s' source_note
UNION ALL
SELECT 'QC6-6773' product_code,'21' machine_code,240.000000 standard_time_seconds,15.000000 output_per_hour,12 source_row,'210s-240s' source_note
UNION ALL
SELECT 'QC6-6773' product_code,'22' machine_code,240.000000 standard_time_seconds,15.000000 output_per_hour,12 source_row,'210s-240s' source_note
UNION ALL
SELECT 'QC4-7630' product_code,'19' machine_code,46.000000 standard_time_seconds,78.260870 output_per_hour,13 source_row,'45-46s' source_note
UNION ALL
SELECT 'QC4-7630' product_code,'23' machine_code,46.000000 standard_time_seconds,78.260870 output_per_hour,13 source_row,'45-46s' source_note
UNION ALL
SELECT 'QC4-7630' product_code,'24' machine_code,46.000000 standard_time_seconds,78.260870 output_per_hour,13 source_row,'45-46s' source_note
UNION ALL
SELECT 'QC3-2556' product_code,'3' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,14 source_row,'13s-14s' source_note
UNION ALL
SELECT 'QC3-2556' product_code,'5' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,14 source_row,'13s-14s' source_note
UNION ALL
SELECT 'QC3-2801' product_code,'3' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,15 source_row,'13s-14s' source_note
UNION ALL
SELECT 'QC3-2801' product_code,'5' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,15 source_row,'13s-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'3' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,16 source_row,'13s-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'5' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,16 source_row,'13s-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'1' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'2' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'3' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'4' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'5' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'6' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'8' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'9' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'10' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'11' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'1' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'2' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'3' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'4' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'5' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'6' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'8' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'9' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'10' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'11' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'1' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'2' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'3' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'4' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'5' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'6' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'8' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'9' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'10' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'11' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-9503' product_code,'19' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row,'Lần 1 :20s\nLần 2 :20s' source_note
UNION ALL
SELECT 'QC8-9503' product_code,'27' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row,'Lần 1 :20s\nLần 2 :20s' source_note
UNION ALL
SELECT 'QC8-9503' product_code,'28' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row,'Lần 1 :20s\nLần 2 :20s' source_note
UNION ALL
SELECT 'QC8-9503' product_code,'29' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row,'Lần 1 :20s\nLần 2 :20s' source_note
UNION ALL
SELECT 'QC8-9503' product_code,'30' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row,'Lần 1 :20s\nLần 2 :20s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'19' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'23' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'24' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'25' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'26' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'27' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'28' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'29' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'30' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'19' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'23' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'24' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'25' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'26' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'27' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'28' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'29' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'30' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'MA3-0575' product_code,'19' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row,'Lần 1:10-12s\nLần 2:20-22s' source_note
UNION ALL
SELECT 'MA3-0575' product_code,'27' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row,'Lần 1:10-12s\nLần 2:20-22s' source_note
UNION ALL
SELECT 'MA3-0575' product_code,'28' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row,'Lần 1:10-12s\nLần 2:20-22s' source_note
UNION ALL
SELECT 'MA3-0575' product_code,'29' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row,'Lần 1:10-12s\nLần 2:20-22s' source_note
UNION ALL
SELECT 'MA3-0575' product_code,'30' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row,'Lần 1:10-12s\nLần 2:20-22s' source_note
UNION ALL
SELECT '6A3-0977' product_code,'19' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row,'40s' source_note
UNION ALL
SELECT '6A3-0977' product_code,'27' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row,'40s' source_note
UNION ALL
SELECT '6A3-0977' product_code,'28' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row,'40s' source_note
UNION ALL
SELECT '6A3-0977' product_code,'29' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row,'40s' source_note
UNION ALL
SELECT '6A3-0977' product_code,'30' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row,'40s' source_note
UNION ALL
SELECT 'QC5-9565' product_code,'19' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row,'Khoảng 1 :14-15s\nKhoảng 1 :14-15s' source_note
UNION ALL
SELECT 'QC5-9565' product_code,'27' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row,'Khoảng 1 :14-15s\nKhoảng 1 :14-15s' source_note
UNION ALL
SELECT 'QC5-9565' product_code,'28' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row,'Khoảng 1 :14-15s\nKhoảng 1 :14-15s' source_note
UNION ALL
SELECT 'QC5-9565' product_code,'29' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row,'Khoảng 1 :14-15s\nKhoảng 1 :14-15s' source_note
UNION ALL
SELECT 'QC5-9565' product_code,'31' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row,'Khoảng 1 :14-15s\nKhoảng 1 :14-15s' source_note
UNION ALL
SELECT 'QC8-1467' product_code,'29' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,59 source_row,'Khoảng 1 :Lần 1 :44s\nLần 2:29s\nKhoảng 2 :Lần 1:44s\nLần 2:29s' source_note
UNION ALL
SELECT 'QC8-1467' product_code,'30' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,59 source_row,'Khoảng 1 :Lần 1 :44s\nLần 2:29s\nKhoảng 2 :Lần 1:44s\nLần 2:29s' source_note
UNION ALL
SELECT 'QC8-1470' product_code,'29' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,60 source_row,'Khoảng 1 :Lần 1 :44s\nLần 2:29s\nKhoảng 2 :Lần 1:44s\nLần 2:29s' source_note
UNION ALL
SELECT 'QC8-1470' product_code,'30' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,60 source_row,'Khoảng 1 :Lần 1 :44s\nLần 2:29s\nKhoảng 2 :Lần 1:44s\nLần 2:29s' source_note
UNION ALL
SELECT 'QC5-3438' product_code,'19' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,61 source_row,'9~10 s' source_note
UNION ALL
SELECT 'QC5-3438' product_code,'23' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,61 source_row,'9~10 s' source_note
UNION ALL
SELECT 'QC5-3438' product_code,'24' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,61 source_row,'9~10 s' source_note
UNION ALL
SELECT 'QC2-9149' product_code,'8' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,62 source_row,'10-11s' source_note
UNION ALL
SELECT 'QC5-1080' product_code,'4' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,63 source_row,'12~15 s' source_note
UNION ALL
SELECT 'QC4-8484' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-8484' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-8484' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-8484' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-8484' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-8484' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-8485' product_code,'13' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC4-8485' product_code,'14' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC4-8485' product_code,'17' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC4-8485' product_code,'18' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC4-8485' product_code,'21' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC4-8485' product_code,'22' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC4-2821' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-2821' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-2821' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-2821' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-2821' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-2821' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-2822' product_code,'13' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row,'27~29 s' source_note
UNION ALL
SELECT 'QC4-2822' product_code,'14' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row,'27~29 s' source_note
UNION ALL
SELECT 'QC4-2822' product_code,'17' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row,'27~29 s' source_note
UNION ALL
SELECT 'QC4-2822' product_code,'18' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row,'27~29 s' source_note
UNION ALL
SELECT 'QC4-2822' product_code,'21' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row,'27~29 s' source_note
UNION ALL
SELECT 'QC4-2822' product_code,'22' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row,'27~29 s' source_note
UNION ALL
SELECT 'QC5-1090' product_code,'13' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row,'28s' source_note
UNION ALL
SELECT 'QC5-1090' product_code,'14' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row,'28s' source_note
UNION ALL
SELECT 'QC5-1090' product_code,'17' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row,'28s' source_note
UNION ALL
SELECT 'QC5-1090' product_code,'18' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row,'28s' source_note
UNION ALL
SELECT 'QC5-1090' product_code,'21' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row,'28s' source_note
UNION ALL
SELECT 'QC5-1090' product_code,'22' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row,'28s' source_note
UNION ALL
SELECT 'QC6-8234' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8234' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8234' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8234' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8234' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8234' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8235' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8235' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8235' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8235' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8235' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8235' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row,'24-26s' source_note
UNION ALL
SELECT 'LF5243' product_code,'13' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row,'55-60s' source_note
UNION ALL
SELECT 'LF5243' product_code,'14' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row,'55-60s' source_note
UNION ALL
SELECT 'LF5243' product_code,'15' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row,'55-60s' source_note
UNION ALL
SELECT 'LF5243' product_code,'16' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row,'55-60s' source_note
UNION ALL
SELECT 'LF5243' product_code,'17' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row,'55-60s' source_note
UNION ALL
SELECT 'LF5243' product_code,'18' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row,'55-60s' source_note
UNION ALL
SELECT 'D0015U' product_code,'13' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row,'50-55s' source_note
UNION ALL
SELECT 'D0015U' product_code,'14' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row,'50-55s' source_note
UNION ALL
SELECT 'D0015U' product_code,'15' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row,'50-55s' source_note
UNION ALL
SELECT 'D0015U' product_code,'16' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row,'50-55s' source_note
UNION ALL
SELECT 'D0015U' product_code,'17' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row,'50-55s' source_note
UNION ALL
SELECT 'D0015U' product_code,'18' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row,'50-55s' source_note
UNION ALL
SELECT 'LEH123' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH123' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH123' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH123' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH123' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH123' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH125' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH125' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH125' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH125' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH125' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH125' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016M' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016M' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016M' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016M' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016M' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016M' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016D' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016D' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016D' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016D' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016D' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016D' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row,'14-16s' source_note
UNION ALL
SELECT 'D000PK' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row,'14-16s' source_note
UNION ALL
SELECT 'D000PK' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row,'14-16s' source_note
UNION ALL
SELECT 'D000PK' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row,'14-16s' source_note
UNION ALL
SELECT 'D000PK' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row,'14-16s' source_note
UNION ALL
SELECT 'D000PK' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row,'14-16s' source_note
UNION ALL
SELECT 'D000PK' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016H' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row,'12-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row,'12-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row,'12-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row,'12-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row,'12-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row,'12-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row,'20-25s' source_note
UNION ALL
SELECT 'D0006E' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row,'20-25s' source_note
UNION ALL
SELECT 'D0006E' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row,'20-25s' source_note
UNION ALL
SELECT 'D0006E' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row,'20-25s' source_note
UNION ALL
SELECT 'D0006E' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row,'20-25s' source_note
UNION ALL
SELECT 'D0006E' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row,'20-25s' source_note
UNION ALL
SELECT 'LY9276' product_code,'20' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row,'5-10s' source_note
UNION ALL
SELECT 'LY9276' product_code,'15' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row,'5-10s' source_note
UNION ALL
SELECT 'LY9276' product_code,'16' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row,'5-10s' source_note
UNION ALL
SELECT 'LY9276' product_code,'7' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row,'5-10s' source_note
UNION ALL
SELECT 'LY9276' product_code,'12' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row,'5-10s' source_note
UNION ALL
SELECT 'LY9276' product_code,'19' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row,'5-10s' source_note
UNION ALL
SELECT 'DOO2SS' product_code,'20' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row,'8-16s' source_note
UNION ALL
SELECT 'DOO2SS' product_code,'15' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row,'8-16s' source_note
UNION ALL
SELECT 'DOO2SS' product_code,'16' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row,'8-16s' source_note
UNION ALL
SELECT 'DOO2SS' product_code,'7' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row,'8-16s' source_note
UNION ALL
SELECT 'DOO2SS' product_code,'12' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row,'8-16s' source_note
UNION ALL
SELECT 'DOO2SS' product_code,'19' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row,'8-16s' source_note
UNION ALL
SELECT 'LEH123' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'P28596001' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,89 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P28596001' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,89 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P27678011' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,90 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P27678011' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,90 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P10255004' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,91 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P10255004' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,91 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P45840001' product_code,'13' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,92 source_row,'Lần 1:34-35s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P45840001' product_code,'18' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,92 source_row,'Lần 1:34-35s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P57692402' product_code,'13' machine_code,52.000000 standard_time_seconds,69.230769 output_per_hour,93 source_row,'Lần 1:31-32s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P57692402' product_code,'18' machine_code,52.000000 standard_time_seconds,69.230769 output_per_hour,93 source_row,'Lần 1:31-32s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P57049906' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,94 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P57049906' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,94 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P58966900' product_code,'13' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,95 source_row,'Lần 1:34-35s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P58966900' product_code,'18' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,95 source_row,'Lần 1:34-35s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P62830603' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,96 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P62830603' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,96 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P66869902' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,97 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P66869902' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,97 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P49746004' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,98 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P49746004' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,98 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P32679023' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,99 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P32679023' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,99 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT '30375120' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,100 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT '30375120' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,100 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'QC7-6485' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row,'18-20 s' source_note
UNION ALL
SELECT 'QC7-6485' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row,'18-20 s' source_note
UNION ALL
SELECT 'QC7-6485' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row,'18-20 s' source_note
UNION ALL
SELECT 'QC7-6485' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row,'18-20 s' source_note
UNION ALL
SELECT 'QC7-6486' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6486' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6486' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6486' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6487' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6487' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6487' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6487' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6488' product_code,'27' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6488' product_code,'28' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6488' product_code,'29' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6488' product_code,'30' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6489' product_code,'27' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6489' product_code,'28' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6489' product_code,'29' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6489' product_code,'30' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6490' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row,'13-15s' source_note
UNION ALL
SELECT 'QC7-6490' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row,'13-15s' source_note
UNION ALL
SELECT 'QC7-6490' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row,'13-15s' source_note
UNION ALL
SELECT 'QC7-6490' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row,'13-15s' source_note
UNION ALL
SELECT 'QC7-6491' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6491' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6491' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6491' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6492' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6492' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6492' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6492' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6493' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6493' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6493' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6493' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6494' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6494' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6494' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6494' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6495' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6495' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6495' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6495' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row,'12-14s' source_note
UNION ALL
SELECT '625542421' product_code,'14' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,112 source_row,'20-22 s' source_note
UNION ALL
SELECT '625542421' product_code,'17' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,112 source_row,'20-22 s' source_note
UNION ALL
SELECT '625542431' product_code,'14' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,113 source_row,'16-18 s' source_note
UNION ALL
SELECT '625542431' product_code,'17' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,113 source_row,'16-18 s' source_note
UNION ALL
SELECT '625543311' product_code,'14' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,114 source_row,'16-18 s' source_note
UNION ALL
SELECT '625543311' product_code,'17' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,114 source_row,'16-18 s' source_note
UNION ALL
SELECT '625543311' product_code,'19' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row,'20-22 s' source_note
UNION ALL
SELECT '625543311' product_code,'27' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row,'20-22 s' source_note
UNION ALL
SELECT '625543311' product_code,'28' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row,'20-22 s' source_note
UNION ALL
SELECT '625543311' product_code,'29' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row,'20-22 s' source_note
UNION ALL
SELECT '625543311' product_code,'30' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row,'20-22 s' source_note
UNION ALL
SELECT 'QC8-6328' product_code,'19' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6328' product_code,'27' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6328' product_code,'28' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6328' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6328' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6330' product_code,'19' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6330' product_code,'27' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6330' product_code,'28' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6330' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6330' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row,'80s' source_note
) src ON 1=1 WHERE p.process_code='MAI'
ON DUPLICATE KEY UPDATE standard_time_seconds=VALUES(standard_time_seconds),calculated_output_per_hour=VALUES(calculated_output_per_hour),source_note=VALUES(source_note),is_active=1;

INSERT INTO product_machine_standards (process_id,product_code,machine_id,standard_output,standard_time_seconds,calculated_output_per_hour,source_name,source_row_number,effective_from,effective_to,is_active)
SELECT p.id,src.product_code,m.id,src.output_per_hour,src.standard_time_seconds,src.output_per_hour,'Book2(3).xlsx',src.source_row,DATE('2026-08-10'),NULL,1 FROM processes p JOIN (
SELECT '30375120' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,100 source_row
UNION ALL
SELECT '30375120' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,100 source_row
UNION ALL
SELECT '625542421' product_code,'14' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,112 source_row
UNION ALL
SELECT '625542421' product_code,'17' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,112 source_row
UNION ALL
SELECT '625542431' product_code,'14' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,113 source_row
UNION ALL
SELECT '625542431' product_code,'17' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,113 source_row
UNION ALL
SELECT '625543311' product_code,'14' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,114 source_row
UNION ALL
SELECT '625543311' product_code,'17' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,114 source_row
UNION ALL
SELECT '625543311' product_code,'19' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row
UNION ALL
SELECT '625543311' product_code,'27' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row
UNION ALL
SELECT '625543311' product_code,'28' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row
UNION ALL
SELECT '625543311' product_code,'29' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row
UNION ALL
SELECT '625543311' product_code,'30' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row
UNION ALL
SELECT '6A3-0977' product_code,'19' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row
UNION ALL
SELECT '6A3-0977' product_code,'27' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row
UNION ALL
SELECT '6A3-0977' product_code,'28' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row
UNION ALL
SELECT '6A3-0977' product_code,'29' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row
UNION ALL
SELECT '6A3-0977' product_code,'30' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row
UNION ALL
SELECT 'D0006E' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row
UNION ALL
SELECT 'D0006E' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row
UNION ALL
SELECT 'D0006E' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row
UNION ALL
SELECT 'D0006E' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row
UNION ALL
SELECT 'D0006E' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row
UNION ALL
SELECT 'D0006E' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row
UNION ALL
SELECT 'D0006E' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D000PK' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row
UNION ALL
SELECT 'D000PK' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row
UNION ALL
SELECT 'D000PK' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row
UNION ALL
SELECT 'D000PK' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row
UNION ALL
SELECT 'D000PK' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row
UNION ALL
SELECT 'D000PK' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row
UNION ALL
SELECT 'D000PK' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D0015U' product_code,'13' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row
UNION ALL
SELECT 'D0015U' product_code,'14' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row
UNION ALL
SELECT 'D0015U' product_code,'15' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row
UNION ALL
SELECT 'D0015U' product_code,'16' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row
UNION ALL
SELECT 'D0015U' product_code,'17' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row
UNION ALL
SELECT 'D0015U' product_code,'18' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row
UNION ALL
SELECT 'D0016D' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row
UNION ALL
SELECT 'D0016D' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row
UNION ALL
SELECT 'D0016D' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row
UNION ALL
SELECT 'D0016D' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row
UNION ALL
SELECT 'D0016D' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row
UNION ALL
SELECT 'D0016D' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row
UNION ALL
SELECT 'D0016D' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016H' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row
UNION ALL
SELECT 'D0016H' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row
UNION ALL
SELECT 'D0016H' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row
UNION ALL
SELECT 'D0016H' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row
UNION ALL
SELECT 'D0016H' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row
UNION ALL
SELECT 'D0016H' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row
UNION ALL
SELECT 'D0016H' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016M' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row
UNION ALL
SELECT 'D0016M' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row
UNION ALL
SELECT 'D0016M' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row
UNION ALL
SELECT 'D0016M' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row
UNION ALL
SELECT 'D0016M' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row
UNION ALL
SELECT 'D0016M' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row
UNION ALL
SELECT 'D0016M' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'DOO2SS' product_code,'7' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row
UNION ALL
SELECT 'DOO2SS' product_code,'12' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row
UNION ALL
SELECT 'DOO2SS' product_code,'15' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row
UNION ALL
SELECT 'DOO2SS' product_code,'16' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row
UNION ALL
SELECT 'DOO2SS' product_code,'19' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row
UNION ALL
SELECT 'DOO2SS' product_code,'20' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'19' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'23' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'24' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'25' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'26' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'27' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'28' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'29' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'30' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'19' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'23' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'24' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'25' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'26' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'27' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'28' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'29' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'30' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'LEH123' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row
UNION ALL
SELECT 'LEH123' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row
UNION ALL
SELECT 'LEH123' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row
UNION ALL
SELECT 'LEH123' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row
UNION ALL
SELECT 'LEH123' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row
UNION ALL
SELECT 'LEH123' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row
UNION ALL
SELECT 'LEH123' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH125' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row
UNION ALL
SELECT 'LEH125' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row
UNION ALL
SELECT 'LEH125' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row
UNION ALL
SELECT 'LEH125' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row
UNION ALL
SELECT 'LEH125' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row
UNION ALL
SELECT 'LEH125' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row
UNION ALL
SELECT 'LEH125' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LF5243' product_code,'13' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row
UNION ALL
SELECT 'LF5243' product_code,'14' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row
UNION ALL
SELECT 'LF5243' product_code,'15' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row
UNION ALL
SELECT 'LF5243' product_code,'16' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row
UNION ALL
SELECT 'LF5243' product_code,'17' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row
UNION ALL
SELECT 'LF5243' product_code,'18' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row
UNION ALL
SELECT 'LY9276' product_code,'7' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row
UNION ALL
SELECT 'LY9276' product_code,'12' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row
UNION ALL
SELECT 'LY9276' product_code,'15' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row
UNION ALL
SELECT 'LY9276' product_code,'16' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row
UNION ALL
SELECT 'LY9276' product_code,'19' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row
UNION ALL
SELECT 'LY9276' product_code,'20' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row
UNION ALL
SELECT 'MA3-0575' product_code,'19' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row
UNION ALL
SELECT 'MA3-0575' product_code,'27' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row
UNION ALL
SELECT 'MA3-0575' product_code,'28' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row
UNION ALL
SELECT 'MA3-0575' product_code,'29' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row
UNION ALL
SELECT 'MA3-0575' product_code,'30' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row
UNION ALL
SELECT 'P10255004' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,91 source_row
UNION ALL
SELECT 'P10255004' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,91 source_row
UNION ALL
SELECT 'P27678011' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,90 source_row
UNION ALL
SELECT 'P27678011' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,90 source_row
UNION ALL
SELECT 'P28596001' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,89 source_row
UNION ALL
SELECT 'P28596001' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,89 source_row
UNION ALL
SELECT 'P32679023' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,99 source_row
UNION ALL
SELECT 'P32679023' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,99 source_row
UNION ALL
SELECT 'P45840001' product_code,'13' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,92 source_row
UNION ALL
SELECT 'P45840001' product_code,'18' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,92 source_row
UNION ALL
SELECT 'P49746004' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,98 source_row
UNION ALL
SELECT 'P49746004' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,98 source_row
UNION ALL
SELECT 'P57049906' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,94 source_row
UNION ALL
SELECT 'P57049906' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,94 source_row
UNION ALL
SELECT 'P57692402' product_code,'13' machine_code,52.000000 standard_time_seconds,69.230769 output_per_hour,93 source_row
UNION ALL
SELECT 'P57692402' product_code,'18' machine_code,52.000000 standard_time_seconds,69.230769 output_per_hour,93 source_row
UNION ALL
SELECT 'P58966900' product_code,'13' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,95 source_row
UNION ALL
SELECT 'P58966900' product_code,'18' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,95 source_row
UNION ALL
SELECT 'P62830603' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,96 source_row
UNION ALL
SELECT 'P62830603' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,96 source_row
UNION ALL
SELECT 'P66869902' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,97 source_row
UNION ALL
SELECT 'P66869902' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,97 source_row
UNION ALL
SELECT 'QC2-9149' product_code,'8' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,62 source_row
UNION ALL
SELECT 'QC3-2556' product_code,'3' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,14 source_row
UNION ALL
SELECT 'QC3-2556' product_code,'5' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,14 source_row
UNION ALL
SELECT 'QC3-2801' product_code,'3' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,15 source_row
UNION ALL
SELECT 'QC3-2801' product_code,'5' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,15 source_row
UNION ALL
SELECT 'QC4-2821' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row
UNION ALL
SELECT 'QC4-2821' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row
UNION ALL
SELECT 'QC4-2821' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row
UNION ALL
SELECT 'QC4-2821' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row
UNION ALL
SELECT 'QC4-2821' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row
UNION ALL
SELECT 'QC4-2821' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row
UNION ALL
SELECT 'QC4-2822' product_code,'13' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row
UNION ALL
SELECT 'QC4-2822' product_code,'14' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row
UNION ALL
SELECT 'QC4-2822' product_code,'17' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row
UNION ALL
SELECT 'QC4-2822' product_code,'18' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row
UNION ALL
SELECT 'QC4-2822' product_code,'21' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row
UNION ALL
SELECT 'QC4-2822' product_code,'22' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'1' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'2' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'3' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'4' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'5' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'6' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'8' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'9' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'10' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'11' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7630' product_code,'19' machine_code,46.000000 standard_time_seconds,78.260870 output_per_hour,13 source_row
UNION ALL
SELECT 'QC4-7630' product_code,'23' machine_code,46.000000 standard_time_seconds,78.260870 output_per_hour,13 source_row
UNION ALL
SELECT 'QC4-7630' product_code,'24' machine_code,46.000000 standard_time_seconds,78.260870 output_per_hour,13 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'1' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'2' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'3' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'4' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'5' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'6' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'8' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'9' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'10' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'11' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-8484' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row
UNION ALL
SELECT 'QC4-8484' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row
UNION ALL
SELECT 'QC4-8484' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row
UNION ALL
SELECT 'QC4-8484' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row
UNION ALL
SELECT 'QC4-8484' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row
UNION ALL
SELECT 'QC4-8484' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row
UNION ALL
SELECT 'QC4-8485' product_code,'13' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row
UNION ALL
SELECT 'QC4-8485' product_code,'14' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row
UNION ALL
SELECT 'QC4-8485' product_code,'17' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row
UNION ALL
SELECT 'QC4-8485' product_code,'18' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row
UNION ALL
SELECT 'QC4-8485' product_code,'21' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row
UNION ALL
SELECT 'QC4-8485' product_code,'22' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1080' product_code,'4' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,63 source_row
UNION ALL
SELECT 'QC5-1090' product_code,'13' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row
UNION ALL
SELECT 'QC5-1090' product_code,'14' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row
UNION ALL
SELECT 'QC5-1090' product_code,'17' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row
UNION ALL
SELECT 'QC5-1090' product_code,'18' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row
UNION ALL
SELECT 'QC5-1090' product_code,'21' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row
UNION ALL
SELECT 'QC5-1090' product_code,'22' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row
UNION ALL
SELECT 'QC5-1657' product_code,'21' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,8 source_row
UNION ALL
SELECT 'QC5-1657' product_code,'22' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,8 source_row
UNION ALL
SELECT 'QC5-1657' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,10 source_row
UNION ALL
SELECT 'QC5-1657' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,10 source_row
UNION ALL
SELECT 'QC5-1660' product_code,'21' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,9 source_row
UNION ALL
SELECT 'QC5-1660' product_code,'22' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,9 source_row
UNION ALL
SELECT 'QC5-1660' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,11 source_row
UNION ALL
SELECT 'QC5-1660' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,11 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3438' product_code,'19' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,61 source_row
UNION ALL
SELECT 'QC5-3438' product_code,'23' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,61 source_row
UNION ALL
SELECT 'QC5-3438' product_code,'24' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,61 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'1' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'2' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'3' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'4' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'5' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'6' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'8' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'9' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'10' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'11' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-9565' product_code,'19' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row
UNION ALL
SELECT 'QC5-9565' product_code,'27' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row
UNION ALL
SELECT 'QC5-9565' product_code,'28' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row
UNION ALL
SELECT 'QC5-9565' product_code,'29' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row
UNION ALL
SELECT 'QC5-9565' product_code,'31' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-6773' product_code,'21' machine_code,240.000000 standard_time_seconds,15.000000 output_per_hour,12 source_row
UNION ALL
SELECT 'QC6-6773' product_code,'22' machine_code,240.000000 standard_time_seconds,15.000000 output_per_hour,12 source_row
UNION ALL
SELECT 'QC6-8234' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row
UNION ALL
SELECT 'QC6-8234' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row
UNION ALL
SELECT 'QC6-8234' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row
UNION ALL
SELECT 'QC6-8234' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row
UNION ALL
SELECT 'QC6-8234' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row
UNION ALL
SELECT 'QC6-8234' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row
UNION ALL
SELECT 'QC6-8235' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row
UNION ALL
SELECT 'QC6-8235' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row
UNION ALL
SELECT 'QC6-8235' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row
UNION ALL
SELECT 'QC6-8235' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row
UNION ALL
SELECT 'QC6-8235' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row
UNION ALL
SELECT 'QC6-8235' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6485' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row
UNION ALL
SELECT 'QC7-6485' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row
UNION ALL
SELECT 'QC7-6485' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row
UNION ALL
SELECT 'QC7-6485' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row
UNION ALL
SELECT 'QC7-6486' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row
UNION ALL
SELECT 'QC7-6486' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row
UNION ALL
SELECT 'QC7-6486' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row
UNION ALL
SELECT 'QC7-6486' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row
UNION ALL
SELECT 'QC7-6487' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row
UNION ALL
SELECT 'QC7-6487' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row
UNION ALL
SELECT 'QC7-6487' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row
UNION ALL
SELECT 'QC7-6487' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row
UNION ALL
SELECT 'QC7-6488' product_code,'27' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row
UNION ALL
SELECT 'QC7-6488' product_code,'28' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row
UNION ALL
SELECT 'QC7-6488' product_code,'29' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row
UNION ALL
SELECT 'QC7-6488' product_code,'30' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row
UNION ALL
SELECT 'QC7-6489' product_code,'27' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row
UNION ALL
SELECT 'QC7-6489' product_code,'28' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row
UNION ALL
SELECT 'QC7-6489' product_code,'29' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row
UNION ALL
SELECT 'QC7-6489' product_code,'30' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row
UNION ALL
SELECT 'QC7-6490' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row
UNION ALL
SELECT 'QC7-6490' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row
UNION ALL
SELECT 'QC7-6490' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row
UNION ALL
SELECT 'QC7-6490' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row
UNION ALL
SELECT 'QC7-6491' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row
UNION ALL
SELECT 'QC7-6491' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row
UNION ALL
SELECT 'QC7-6491' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row
UNION ALL
SELECT 'QC7-6491' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row
UNION ALL
SELECT 'QC7-6492' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row
UNION ALL
SELECT 'QC7-6492' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row
UNION ALL
SELECT 'QC7-6492' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row
UNION ALL
SELECT 'QC7-6492' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row
UNION ALL
SELECT 'QC7-6493' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row
UNION ALL
SELECT 'QC7-6493' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row
UNION ALL
SELECT 'QC7-6493' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row
UNION ALL
SELECT 'QC7-6493' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row
UNION ALL
SELECT 'QC7-6494' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row
UNION ALL
SELECT 'QC7-6494' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row
UNION ALL
SELECT 'QC7-6494' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row
UNION ALL
SELECT 'QC7-6494' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row
UNION ALL
SELECT 'QC7-6495' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row
UNION ALL
SELECT 'QC7-6495' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row
UNION ALL
SELECT 'QC7-6495' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row
UNION ALL
SELECT 'QC7-6495' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC8-1467' product_code,'29' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,59 source_row
UNION ALL
SELECT 'QC8-1467' product_code,'30' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,59 source_row
UNION ALL
SELECT 'QC8-1470' product_code,'29' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,60 source_row
UNION ALL
SELECT 'QC8-1470' product_code,'30' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,60 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6328' product_code,'19' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row
UNION ALL
SELECT 'QC8-6328' product_code,'27' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row
UNION ALL
SELECT 'QC8-6328' product_code,'28' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row
UNION ALL
SELECT 'QC8-6328' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row
UNION ALL
SELECT 'QC8-6328' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row
UNION ALL
SELECT 'QC8-6330' product_code,'19' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row
UNION ALL
SELECT 'QC8-6330' product_code,'27' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row
UNION ALL
SELECT 'QC8-6330' product_code,'28' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row
UNION ALL
SELECT 'QC8-6330' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row
UNION ALL
SELECT 'QC8-6330' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-9503' product_code,'19' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row
UNION ALL
SELECT 'QC8-9503' product_code,'27' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row
UNION ALL
SELECT 'QC8-9503' product_code,'28' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row
UNION ALL
SELECT 'QC8-9503' product_code,'29' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row
UNION ALL
SELECT 'QC8-9503' product_code,'30' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
) src ON 1=1 JOIN machines m ON m.process_id=p.id AND UPPER(TRIM(m.machine_code))=UPPER(src.machine_code) WHERE p.process_code='MAI'
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output),standard_time_seconds=VALUES(standard_time_seconds),calculated_output_per_hour=VALUES(calculated_output_per_hour),source_name=VALUES(source_name),source_row_number=VALUES(source_row_number),effective_to=NULL,is_active=1;

SELECT COUNT(*) AS so_bien_the_book2 FROM product_machine_standard_variants v JOIN processes p ON p.id=v.process_id WHERE p.process_code='MAI' AND v.source_name='Book2(3).xlsx';
SELECT COUNT(*) AS so_dinh_muc_may_dang_dung FROM product_machine_standards pms JOIN processes p ON p.id=pms.process_id WHERE p.process_code='MAI' AND pms.is_active=1 AND pms.source_name='Book2(3).xlsx';

-- ==================== ĐỒNG BỘ CHECKSUM MIGRATION ====================
CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_id VARCHAR(160) NOT NULL PRIMARY KEY,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_migrations (migration_id, checksum) VALUES
  ('001_core_master_schema.sql', '1a6d16270203048315a610d4baf57bd3923b625ef495dc73b4043ff60954c9d5'),
  ('002_production_schema.sql', '7e5a0edfbf89355dd63ce101a756fe2b1a2ad4678fd28215031c7c6bf64c4a5e'),
  ('003_machine_and_session_schema.sql', '0de9f6d5702ddcb8af16d3f69d7717654aa31c8eccd13961e0891f11f2a1dd78'),
  ('004_sync_and_export_schema.sql', 'e177e64e251fc261087cb84d5fa6ccb8c5d745c0d942a18e6a25ccc64c441933'),
  ('005_entry_date_compatibility.sql', '6b2aca7221cbf10ed18f7eeaaeb41da2a0a40f8366944ac29728af283ccc9f22'),
  ('006_extra_data_compatibility.sql', '4523fea9e72566eaef036d1f8989ebaef1340cfe70db2c2f3e453e1ccc0f65d6'),
  ('007_production_formula_settings.sql', '35041224668664e02f6ab13a75f55a930015668484fcce4cde889449ba2c9ce5'),
  ('008_client_request_idempotency.sql', '17b07211e4ad4a4e3e31f0fc9272b4fe94b66f37fa0c1dc1821a527f53dacca2'),
  ('009_role_permissions.sql', '1b0081b4e616ab88f9a2e6966b7b5353ecb37b979f71d22158dee2f4e27f9a4d'),
  ('010_audit_governance_demo.sql', 'ed60a0630dd8de3177a52232fccc67983c36c7e304527ebabf5e63e4cf467ea0'),
  ('011_master_seed_support.sql', '4bfb0cf4dacc2b045fc366312976c9ada06fb6802e0af9abcbe83a03e00e905d'),
  ('012_factory_machine_rules_20260810.sql', '14fa966ab8c54d23512e97d6ffc028b8c9ddf31c2923ed2867ba04d7e49b6639'),
  ('013_book2_machine_product_time_20260810.sql', 'f88429a4e88a51b7bc38e7e455711d55eead6d9332fa5cba3c64949ae7a73de4')
ON DUPLICATE KEY UPDATE checksum=VALUES(checksum), applied_at=CURRENT_TIMESTAMP;

-- ==================== KIỂM TRA CUỐI ====================
SELECT 'Công đoạn' AS nhom, COUNT(*) AS so_luong FROM processes
UNION ALL SELECT 'Công nhân', COUNT(*) FROM workers
UNION ALL SELECT 'Máy', COUNT(*) FROM machines
UNION ALL SELECT 'Phân công', COUNT(*) FROM worker_processes
UNION ALL SELECT 'Ánh xạ sản phẩm', COUNT(*) FROM product_aliases
UNION ALL SELECT 'Định mức biến thể', COUNT(*) FROM product_standard_variants
UNION ALL SELECT 'Định mức máy đang dùng', COUNT(*) FROM product_machine_standards WHERE is_active=1
UNION ALL SELECT 'Định mức máy Book2', COUNT(*) FROM product_machine_standards WHERE is_active=1 AND source_name='Book2(3).xlsx'
UNION ALL SELECT 'Biến thể máy Book2', COUNT(*) FROM product_machine_standard_variants WHERE is_active=1 AND source_name='Book2(3).xlsx'
UNION ALL SELECT 'Lần seed', COUNT(*) FROM master_seed_runs;

SELECT migration_id, checksum FROM schema_migrations ORDER BY migration_id;

-- ============================================================
-- TAI KHOAN HE THONG MAC DINH
-- admin    / 123456
-- manager1 / 123456
-- lead1    / 123456
-- ============================================================
INSERT INTO users (username, password, full_name, role, status)
VALUES
  ('admin',    '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Quản trị hệ thống KTC', 'admin',   'active'),
  ('manager1', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Quản lý sản xuất KTC', 'manager', 'active'),
  ('lead1',    '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Tổ trưởng sản xuất KTC', 'lead',   'active')
ON DUPLICATE KEY UPDATE
  password  = VALUES(password),
  full_name = VALUES(full_name),
  role      = VALUES(role),
  status    = 'active';

INSERT IGNORE INTO manager_processes (manager_id, process_id)
SELECT u.id, p.id
FROM users u
CROSS JOIN processes p
WHERE u.username IN ('manager1', 'lead1')
  AND u.role IN ('manager', 'lead')
  AND u.status = 'active'
  AND p.status = 'active';

SELECT id, username, full_name, role, status
FROM users
WHERE username IN ('admin', 'manager1', 'lead1')
ORDER BY FIELD(role, 'admin', 'manager', 'lead');

-- ============================================================
-- 014_user_sessions_login_compat_20260810.sql
-- Đã tích hợp trực tiếp vào CREATE TABLE user_sessions cho bản dựng mới.
-- ============================================================

INSERT INTO schema_migrations (migration_id, checksum)
VALUES ('014_user_sessions_login_compat_20260810.sql', '9a352cda9d437f9ecc5441ac71f6999fb29d41b1486215f8a14b425b32a6825f')
ON DUPLICATE KEY UPDATE checksum=VALUES(checksum), applied_at=CURRENT_TIMESTAMP;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'user_sessions'
ORDER BY ORDINAL_POSITION;

-- ============================================================================
-- 015_latest_excel_source_sync_20260810.sql
-- Đồng bộ 3 file nguồn mới nhất người dùng gửi ngày 10/08/2026.
-- ============================================================================
-- KTC 015: Đồng bộ nguồn Excel mới nhất 10/08/2026.
-- Nguồn:
--   file mẫu(6).xlsx = trùng file mẫu(5).xlsx
--   Book1(8).xlsx    = trùng Book1(7).xlsx
--   Book2(4).xlsx    = bỏ thời gian chuẩn của QC8-1467 và QC8-1470
-- Đồng thời bổ sung 3 mã nhân sự có trong các script nhân sự lịch sử nhưng thiếu snapshot chính:
-- HẠO -> XLBV, thu -> GC, vấn -> MAI + DO.

-- Book2(4): hai mã này không còn thời gian chuẩn hợp lệ, không được dùng giá trị cũ 146 giây.
DELETE pms
FROM product_machine_standards pms
JOIN processes p ON p.id = pms.process_id
WHERE p.process_code = 'MAI'
  AND pms.product_code IN ('QC8-1467', 'QC8-1470');

DELETE pmv
FROM product_machine_standard_variants pmv
JOIN processes p ON p.id = pmv.process_id
WHERE p.process_code = 'MAI'
  AND pmv.product_code IN ('QC8-1467', 'QC8-1470');

DELETE ps
FROM product_standards ps
JOIN processes p ON p.id = ps.process_id
WHERE p.process_code = 'MAI'
  AND ps.product_code IN ('QC8-1467', 'QC8-1470');

-- Bổ sung các mã nhân sự lịch sử còn thiếu trong snapshot file mẫu.
INSERT INTO users (username, password, full_name, role, status)
VALUES
  ('HẠO', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'VÌ BU HẠO', 'worker', 'active'),
  ('thu', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Hiền Thu', 'worker', 'active'),
  ('vấn', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Thị Vấn', 'worker', 'active')
ON DUPLICATE KEY UPDATE
  password = VALUES(password),
  full_name = VALUES(full_name),
  role = 'worker',
  status = 'active';

INSERT INTO workers (user_id, worker_code, department, position, training_percent, status)
SELECT u.id, u.username, 'Sản xuất', 'Công nhân', 100, 'active'
FROM users u
WHERE u.username IN ('HẠO', 'thu', 'vấn')
ON DUPLICATE KEY UPDATE
  user_id = VALUES(user_id),
  department = VALUES(department),
  position = VALUES(position),
  status = 'active';

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, p.id
FROM workers w
JOIN processes p
WHERE (w.worker_code = 'HẠO' AND p.process_code = 'XLBV')
   OR (w.worker_code = 'thu' AND p.process_code = 'GC')
   OR (w.worker_code = 'vấn' AND p.process_code IN ('MAI','DO'));

-- Kiểm tra riêng nguồn Book2 mới.
SELECT
  p.process_code,
  pms.product_code,
  COUNT(*) AS so_dinh_muc_con_lai
FROM product_machine_standards pms
JOIN processes p ON p.id = pms.process_id
WHERE p.process_code = 'MAI'
  AND pms.product_code IN ('QC8-1467','QC8-1470')
GROUP BY p.process_code, pms.product_code;


-- Đổi nhãn nguồn Book2 hợp lệ sang file mới nhất.
UPDATE product_machine_standards
SET source_name = 'Book2(4).xlsx'
WHERE source_name = 'Book2(3).xlsx';

UPDATE product_machine_standard_variants
SET source_name = 'Book2(4).xlsx'
WHERE source_name = 'Book2(3).xlsx';

INSERT INTO schema_migrations (migration_id, checksum)
VALUES ('015_latest_excel_source_sync_20260810.sql', 'd1ee61dd4d45de5b41adc4cd06dc330574f3a4c7118d09b6d3997c03da0c9f8f')
ON DUPLICATE KEY UPDATE checksum=VALUES(checksum), applied_at=CURRENT_TIMESTAMP;

-- ============================================================================
-- KIỂM TRA CUỐI BẢN RESET 15
-- ============================================================================
SELECT 'Công đoạn đang hoạt động' AS nhom, COUNT(*) AS so_luong FROM processes WHERE status='active'
UNION ALL SELECT 'Công nhân đang hoạt động', COUNT(*) FROM workers WHERE status='active'
UNION ALL SELECT 'Máy đang hoạt động', COUNT(*) FROM machines WHERE status='active'
UNION ALL SELECT 'Phân công công nhân', COUNT(*) FROM worker_processes
UNION ALL SELECT 'Ánh xạ sản phẩm', COUNT(*) FROM product_aliases WHERE status='active'
UNION ALL SELECT 'Định mức biến thể', COUNT(*) FROM product_standard_variants WHERE status='active'
UNION ALL SELECT 'Định mức đang dùng', COUNT(*) FROM product_standards WHERE status='active'
UNION ALL SELECT 'Định mức máy Book2(4)', COUNT(*) FROM product_machine_standards WHERE is_active=1 AND source_name='Book2(4).xlsx'
UNION ALL SELECT 'Biến thể máy Book2(4)', COUNT(*) FROM product_machine_standard_variants WHERE is_active=1 AND source_name='Book2(4).xlsx'
UNION ALL SELECT 'Tài khoản hệ thống', COUNT(*) FROM users WHERE username IN ('admin','manager1','lead1');

SELECT id, username, full_name, role, status
FROM users
WHERE username IN ('admin','manager1','lead1')
ORDER BY FIELD(role,'admin','manager','lead');

SELECT p.process_code, COUNT(DISTINCT wp.worker_id) AS so_cong_nhan
FROM processes p
LEFT JOIN worker_processes wp ON wp.process_id=p.id
LEFT JOIN workers w ON w.id=wp.worker_id AND w.status='active'
WHERE p.status='active'
GROUP BY p.id,p.process_code
ORDER BY p.process_code;

SELECT COUNT(*) AS dinh_muc_cu_khong_duoc_con
FROM product_machine_standards pms
JOIN processes p ON p.id=pms.process_id
WHERE p.process_code='MAI'
  AND pms.product_code IN ('QC8-1467','QC8-1470');


-- ==================== 024_logical_duplicate_report_lock_20260813.sql ====================
-- Included in base reset schema above: logical_duplicate_key + duplicate lock table.

-- ==================== 025_formula_settings_effective_range_20260813.sql ====================
-- Included in base reset schema above: effective_from/effective_to DATE NULL.

-- ==================== FINAL CANONICAL MIGRATION LEDGER 001-025 ====================
-- The reset schema embeds the physical result of migrations through 025.
-- Reconcile the ledger with the exact canonical source checksums so db:schema:verify
-- succeeds immediately after a clean reset. Do not use placeholder/manual checksums.
INSERT INTO schema_migrations (migration_id, checksum) VALUES
  ('001_core_master_schema.sql', '1a6d16270203048315a610d4baf57bd3923b625ef495dc73b4043ff60954c9d5'),
  ('002_production_schema.sql', '7e5a0edfbf89355dd63ce101a756fe2b1a2ad4678fd28215031c7c6bf64c4a5e'),
  ('003_machine_and_session_schema.sql', '0de9f6d5702ddcb8af16d3f69d7717654aa31c8eccd13961e0891f11f2a1dd78'),
  ('004_sync_and_export_schema.sql', 'e177e64e251fc261087cb84d5fa6ccb8c5d745c0d942a18e6a25ccc64c441933'),
  ('005_entry_date_compatibility.sql', '6b2aca7221cbf10ed18f7eeaaeb41da2a0a40f8366944ac29728af283ccc9f22'),
  ('006_extra_data_compatibility.sql', '4523fea9e72566eaef036d1f8989ebaef1340cfe70db2c2f3e453e1ccc0f65d6'),
  ('007_production_formula_settings.sql', '35041224668664e02f6ab13a75f55a930015668484fcce4cde889449ba2c9ce5'),
  ('008_client_request_idempotency.sql', '17b07211e4ad4a4e3e31f0fc9272b4fe94b66f37fa0c1dc1821a527f53dacca2'),
  ('009_role_permissions.sql', '1b0081b4e616ab88f9a2e6966b7b5353ecb37b979f71d22158dee2f4e27f9a4d'),
  ('010_audit_governance_demo.sql', 'ed60a0630dd8de3177a52232fccc67983c36c7e304527ebabf5e63e4cf467ea0'),
  ('011_master_seed_support.sql', '4bfb0cf4dacc2b045fc366312976c9ada06fb6802e0af9abcbe83a03e00e905d'),
  ('012_factory_machine_rules_20260810.sql', '14fa966ab8c54d23512e97d6ffc028b8c9ddf31c2923ed2867ba04d7e49b6639'),
  ('013_book2_machine_product_time_20260810.sql', 'f88429a4e88a51b7bc38e7e455711d55eead6d9332fa5cba3c64949ae7a73de4'),
  ('014_user_sessions_login_compat_20260810.sql', '9a352cda9d437f9ecc5441ac71f6999fb29d41b1486215f8a14b425b32a6825f'),
  ('015_latest_excel_source_sync_20260810.sql', 'd1ee61dd4d45de5b41adc4cd06dc330574f3a4c7118d09b6d3997c03da0c9f8f'),
  ('016_integrity_constraints_20260810.sql', '6b0a7cb9e9016203d1cbb9d952903a6976a64e0c2274ff947ec8f3cf07c32403'),
  ('017_integration_sync_job_runtime_contract_20260812.sql', 'a2dcf16dc9b1fed02c9079cf63832f8579549fabbe9ff9ee704f7d02f9af6c50'),
  ('018_gc_shared_machine_max_workers_20260812.sql', '9ee971a02dae884b85292cb53d18ef84a4857f4ca8fc1a0055f42a6a75a7008d'),
  ('019_historical_standard_snapshot_20260812.sql', 'ff3a1591f9288910556e74a52dba53620b4ab368fe45874bc8f7826fc15deb33'),
  ('020_training_percent_snapshot_20260812.sql', 'ba958fc0b8fc069d587ac684285fa6c78283619dc4602c278fb2002b862954b9'),
  ('021_kqd_policy_snapshot_20260812.sql', '461e39f69b34a9e87df2f9387d6c3db7faa0ecb7852e31d16aef053dc2f4cdf7'),
  ('022_shared_machine_accounting_20260812.sql', '8f7d148d32dfb7d0dcbafc4c93afa37424f55e536b39c811aeb991ba0bbdad05'),
  ('023_refresh_session_rotation_20260813.sql', '0f203c361afc20994b56da640c03a348450fbda8d6148021cac88c2fadd03c4d'),
  ('024_logical_duplicate_report_lock_20260813.sql', '60b508fbb7e4b639486151cdcca4d7e36512ce67e018782aa7f5e566fdd7d3d2'),
  ('025_formula_settings_effective_range_20260813.sql', '56385f116d2936411b8f978fbc122b55b1df0965154a01661a0576a1c0fef4ee')
ON DUPLICATE KEY UPDATE checksum=checksum;

SELECT migration_id, checksum FROM schema_migrations ORDER BY migration_id;
