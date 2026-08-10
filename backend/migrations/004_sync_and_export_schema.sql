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
