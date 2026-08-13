-- Wave 0 hardening: keep the declared schema compatible with syncJobModel.js.
-- This migration changes only the integration job runtime contract; it does not
-- change production-report business calculations.

ALTER TABLE integration_sync_jobs
  ADD COLUMN IF NOT EXISTS job_key VARCHAR(191) NULL AFTER job_type;

ALTER TABLE integration_sync_jobs
  ADD COLUMN IF NOT EXISTS work_date DATE NULL AFTER job_key;

ALTER TABLE integration_sync_jobs
  ADD COLUMN IF NOT EXISTS report_month CHAR(7) NULL AFTER work_date;

ALTER TABLE integration_sync_jobs
  ADD COLUMN IF NOT EXISTS process_id BIGINT NULL AFTER report_month;

ALTER TABLE integration_sync_jobs
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0 AFTER status;

ALTER TABLE integration_sync_jobs
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 8 AFTER attempts;

ALTER TABLE integration_sync_jobs
  ADD COLUMN IF NOT EXISTS next_retry_at DATETIME NULL AFTER max_attempts;

ALTER TABLE integration_sync_jobs
  ADD COLUMN IF NOT EXISTS locked_at DATETIME NULL AFTER next_retry_at;

ALTER TABLE integration_sync_jobs
  ADD COLUMN IF NOT EXISTS last_error TEXT NULL AFTER locked_at;

ALTER TABLE integration_sync_jobs
  ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL AFTER last_error;

ALTER TABLE integration_sync_jobs
  ADD COLUMN IF NOT EXISTS result_url TEXT NULL AFTER completed_at;

UPDATE integration_sync_jobs
SET status = 'pending'
WHERE status = 'queued';

ALTER TABLE integration_sync_jobs
  MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_jobs_type_key
  ON integration_sync_jobs(job_type, job_key);

CREATE INDEX IF NOT EXISTS idx_integration_jobs_ready
  ON integration_sync_jobs(status, next_retry_at, locked_at, created_at);
