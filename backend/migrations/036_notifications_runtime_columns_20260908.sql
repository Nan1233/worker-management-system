-- KTC 036: Notification runtime columns required by /api/system/notifications.
-- Idempotent for TiDB/MySQL. The older 027 copy lived under backend/database/migrations;
-- this copy is placed in the active backend/migrations directory used by current DB releases.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS link_url VARCHAR(1000) NULL AFTER message,
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(80) NULL AFTER link_url,
  ADD COLUMN IF NOT EXISTS entity_id BIGINT NULL AFTER entity_type;

CREATE INDEX IF NOT EXISTS idx_notification_entity
  ON notifications (entity_type, entity_id);
