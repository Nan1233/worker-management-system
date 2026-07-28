-- KTC v1.3.7: giữ phiên đăng nhập không hết hạn theo thời gian.
-- Có thể chạy nhiều lần an toàn.
UPDATE user_sessions
SET expires_at = '2099-12-31 23:59:59'
WHERE revoked_at IS NULL
  AND (expires_at IS NULL OR expires_at < '2099-12-31 23:59:59');
