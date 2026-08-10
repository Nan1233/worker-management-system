-- Enforce idempotency at the database layer. If duplicate non-empty request IDs
-- already exist, this migration intentionally fails so they can be reviewed
-- instead of silently deleting production data.
CREATE UNIQUE INDEX uq_prt_worker_client_request
  ON production_reports_temp (worker_id, client_request_id);
