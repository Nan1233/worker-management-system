-- KTC 023: Family-aware one-time refresh-token rotation and replay detection.
-- Rollout policy: pre-F11 active refresh sessions are revoked once; users log in again.
-- New refresh generations store SHA-256 hashes only in user_sessions.refresh_token.

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS family_id VARCHAR(64) NULL AFTER refresh_token_hash,
  ADD COLUMN IF NOT EXISTS consumed_at DATETIME NULL AFTER revoked_at,
  ADD COLUMN IF NOT EXISTS replaced_by_id BIGINT NULL AFTER consumed_at,
  ADD COLUMN IF NOT EXISTS reuse_detected_at DATETIME NULL AFTER replaced_by_id;

ALTER TABLE user_sessions
  ADD UNIQUE INDEX IF NOT EXISTS uq_session_refresh_token (refresh_token),
  ADD INDEX IF NOT EXISTS idx_session_family (family_id, revoked_at, expires_at),
  ADD INDEX IF NOT EXISTS idx_session_replaced_by (replaced_by_id),
  ADD INDEX IF NOT EXISTS idx_session_expiry (expires_at, revoked_at);

-- Do not fabricate lineage for legacy rows. Force one-time re-login at cutover.
UPDATE user_sessions
SET revoked_at = COALESCE(revoked_at, NOW())
WHERE family_id IS NULL
  AND revoked_at IS NULL;
