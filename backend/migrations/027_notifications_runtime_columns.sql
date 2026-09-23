-- KTC 027: Restore notification runtime columns required by backend notification APIs.
-- Idempotent for TiDB/MySQL. Existing production databases are also auto-repaired by auditService.ensureSchema().

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS link_url VARCHAR(1000) NULL AFTER message,
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(80) NULL AFTER link_url,
  ADD COLUMN IF NOT EXISTS entity_id BIGINT NULL AFTER entity_type;

CREATE INDEX IF NOT EXISTS idx_notification_entity
  ON notifications (entity_type, entity_id);
