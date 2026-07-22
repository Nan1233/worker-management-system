# P2 Enterprise upgrade

## Bắt buộc
Chạy `migration_audit_notification_version.sql` trước khi deploy.

## Biến môi trường
- `API_RATE_LIMIT=600` số request / 15 phút / IP.
- `AUTH_RATE_LIMIT=20` số lần đăng nhập thất bại / 15 phút / IP.

## API mới
- `GET /api/system/notifications`
- `PATCH /api/system/notifications/:id/read`
- `PATCH /api/system/notifications/read-all`
- `GET /api/system/activities`
- `GET /api/system/reports/:id/versions?type=approved|temp`

## Chức năng
- Snapshot version trước và sau khi manager sửa báo cáo chính thức.
- Audit activity cho sửa và xóa báo cáo.
- Notification tới công nhân khi báo cáo chính thức bị sửa.
- Request validation middleware cho route tạo và duyệt báo cáo.
- Helmet và rate limiting toàn API, rate limit riêng cho login.
