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
