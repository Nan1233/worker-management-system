-- KTC 036: Notification runtime columns required by /api/system/notifications.
-- Idempotent for TiDB/MySQL.
-- Keep each ADD COLUMN as a separate statement because TiDB can evaluate
-- AFTER references in a multi-column ALTER before newly-added columns exist.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS link_url VARCHAR(1000) NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(80) NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS entity_id BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_entity
  ON notifications (entity_type, entity_id);
