CREATE TABLE IF NOT EXISTS excel_export_jobs (
  id VARCHAR(36) PRIMARY KEY,
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
  INDEX idx_excel_jobs_status_next (status, next_attempt_at, created_at),
  INDEX idx_excel_jobs_created (created_at)
);
