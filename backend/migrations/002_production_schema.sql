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
