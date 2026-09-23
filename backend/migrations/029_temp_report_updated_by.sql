-- KTC 029: Add the audit updater column used by pending-report edit writes.
-- Idempotent for TiDB/MySQL. The authoritative edit history remains report_edit_logs.user_id.
ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL AFTER reviewed_by;

CREATE INDEX IF NOT EXISTS idx_prt_updated_by
  ON production_reports_temp (updated_by, updated_at);