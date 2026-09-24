-- KTC 027: Restore notification runtime columns required by backend notification APIs.
-- TiDB-safe: do not use AFTER on a column that may not exist in the current schema.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS link_url VARCHAR(1000) NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(80) NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS entity_id BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_entity
  ON notifications (entity_type, entity_id);
