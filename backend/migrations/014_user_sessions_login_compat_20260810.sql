-- KTC 014: Đồng bộ schema user_sessions với auth/sessionModel hiện tại.
-- Khắc phục POST /api/auth/login trả 500 sau khi reset DB bằng SQL 001-013.
-- An toàn với dữ liệu phiên cũ: giữ refresh_token_hash, bổ sung cột mà code hiện tại sử dụng.

ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS refresh_token VARCHAR(255) NULL AFTER user_id,
  ADD COLUMN IF NOT EXISTS device_id VARCHAR(64) NULL AFTER refresh_token,
  ADD COLUMN IF NOT EXISTS device_name VARCHAR(255) NULL AFTER device_id,
  ADD COLUMN IF NOT EXISTS last_used_at DATETIME NULL AFTER ip_address;

-- Các DB dựng từ migration 003 cũ có refresh_token_hash NOT NULL.
-- Code hiện tại lưu hash vào refresh_token, vì vậy cột cũ phải cho phép NULL
-- để INSERT phiên mới không bị lỗi.
ALTER TABLE user_sessions
  MODIFY COLUMN refresh_token_hash VARCHAR(255) NULL;

-- Giữ phiên cũ nếu DB trước đây chỉ có refresh_token_hash.
UPDATE user_sessions
SET refresh_token = refresh_token_hash
WHERE refresh_token IS NULL
  AND refresh_token_hash IS NOT NULL;

-- Index phục vụ refresh/logout. TiDB hỗ trợ ADD INDEX IF NOT EXISTS.
ALTER TABLE user_sessions
  ADD INDEX IF NOT EXISTS idx_session_refresh_token (refresh_token);
