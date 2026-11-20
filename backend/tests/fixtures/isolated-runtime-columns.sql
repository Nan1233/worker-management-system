-- Disposable TiDB fixture from archived project migration 060.
-- Original history: commit 2f54247f0f5f5392ded2dff453bc4027b7dde669
-- This is not applied by the runtime or to a shared database.
ALTER TABLE product_standards
  ADD COLUMN IF NOT EXISTS encoding_code VARCHAR(180) NULL;

ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL;

ALTER TABLE machine_production_events
  MODIFY COLUMN standard_source VARCHAR(64) NULL;

ALTER TABLE production_temp_machine_lines
  MODIFY COLUMN standard_source VARCHAR(64) NULL;

ALTER TABLE production_report_machine_lines
  MODIFY COLUMN standard_source VARCHAR(64) NULL;

-- Historical migration 027/036: notifications link and entity identity.
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS link_url VARCHAR(1000) NULL;
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(80) NULL;
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS entity_id BIGINT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_entity
  ON notifications (entity_type, entity_id);

-- Historical migration 059: explicit GC machine work type (no code-prefix guess).
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS gc_work_type VARCHAR(10) NULL;
UPDATE machines m JOIN processes p ON p.id = m.process_id
SET m.gc_work_type='CUT'
WHERE UPPER(TRIM(p.process_code))='GC' AND m.gc_work_type IS NULL
  AND m.machine_name REGEXP '^Máy cắt số [0-9]+';
UPDATE machines m JOIN processes p ON p.id = m.process_id
SET m.gc_work_type='LONG'
WHERE UPPER(TRIM(p.process_code))='GC' AND m.gc_work_type IS NULL
  AND m.machine_name REGEXP '^Máy lồng số [0-9]+';

-- Historical migration 029: pending-report edit audit updater.
ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL;
CREATE INDEX IF NOT EXISTS idx_prt_updated_by
  ON production_reports_temp (updated_by, updated_at);

-- Historical approved-report list projection expects a stored standard-time
-- target. The canonical 2026-08-17 snapshot predates this column.
-- Restricted strictly to the disposable ktc_it_* acceptance database.
ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS tt_dinh_muc DECIMAL(18,6) NULL;
