-- F12 Data Integrity Closure Part 3: serialize logical duplicate report creation
-- without hard-blocking explicit force_create repeated runs.
ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS logical_duplicate_key CHAR(64) NULL AFTER client_request_id;

CREATE INDEX IF NOT EXISTS idx_prt_logical_duplicate_status
  ON production_reports_temp (logical_duplicate_key, status, worker_id, process_id, work_date, shift);

CREATE TABLE IF NOT EXISTS production_report_duplicate_locks (
  logical_key CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (logical_key)
);
