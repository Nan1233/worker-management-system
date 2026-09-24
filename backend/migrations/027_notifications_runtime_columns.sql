-- KTC 027: Restore notification runtime columns required by backend notification APIs.
-- Keep each ADD COLUMN in a separate ALTER because TiDB cannot reliably use a
-- column introduced earlier in the same ALTER as an AFTER target.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS link_url VARCHAR(1000) NULL AFTER message;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(80) NULL AFTER link_url;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS entity_id BIGINT NULL AFTER entity_type;

CREATE INDEX IF NOT EXISTS idx_notification_entity
  ON notifications (entity_type, entity_id);
