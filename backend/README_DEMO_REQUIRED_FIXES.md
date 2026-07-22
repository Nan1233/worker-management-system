# Các sửa đổi bắt buộc trước demo

## Chạy production
- Web API: `npm start`
- Background worker: `npm run worker`
- Render Blueprint: dùng `render.yaml` để tạo riêng Web Service và Background Worker.
- Cần cấu hình chung toàn bộ biến DB/Google giữa hai service.
- Cấu hình `NODE_ENV=production` và `SYNC_CRON_SECRET`.
- Cron ngoài có thể gọi `POST /api/sync-jobs/process` với header `X-Cron-Secret`; worker riêng là phương án chính.

## Export Excel selected
API giới hạn tối đa 100 ID/lần để tránh OOM. Frontend hiện chọn theo trang 20 dòng nên phù hợp demo.

## Database
Cần chạy các migration đã có trong dự án, đặc biệt:
- `migration_reliability_and_sync.sql`
- `migration_audit_notification_version.sql`
