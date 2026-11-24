-- OPERATOR-RUN ONLY. Back up TiDB before applying. Cloudflare must not run this SQL.
-- Deploy only when Desktop and Backend both support operation_id.
CREATE TABLE IF NOT EXISTS excel_sync_operation_receipts (
  idempotency_key CHAR(64) NOT NULL,
  actor_id BIGINT NOT NULL,
  request_sha256 CHAR(64) NOT NULL,
  result_json JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  completed_at DATETIME(6) NULL,
  PRIMARY KEY (idempotency_key),
  KEY idx_excel_receipt_actor_created (actor_id, created_at)
);

-- Upgrade optimistic concurrency precision for future edits.
-- Existing timestamps retain their second-level value; newer writes get microseconds.
ALTER TABLE production_reports
  MODIFY COLUMN updated_at TIMESTAMP(6) NOT NULL
    DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6);
