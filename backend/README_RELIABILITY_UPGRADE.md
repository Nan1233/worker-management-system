# Nâng cấp độ ổn định báo cáo

## 1. Chạy migration
Chạy file `migration_reliability_and_sync.sql` trên TiDB/MySQL trước khi deploy code mới.

## 2. Biến môi trường mới
- `SYNC_CRON_SECRET`: secret bảo vệ endpoint xử lý hàng đợi.
- `EXCEL_EXPORT_ROOT`: thư mục lưu file Excel tháng. Mặc định là `backend/exports`.

## 3. Cron retry
Thiết lập Render Cron gọi mỗi 5 phút:

- Method: `POST`
- URL: `https://<backend>/api/sync-jobs/process`
- Header: `X-Cron-Secret: <SYNC_CRON_SECRET>`
- Body: `{ "limit": 5 }`

## 4. Cấu trúc Excel
`<EXCEL_EXPORT_ROOT>/<năm>/Bao-cao-san-xuat-YYYY-MM.xlsx`

Mỗi công đoạn là một sheet. File được rebuild từ database bằng streaming writer và thay thế atomically.

## 5. Lưu ý Render
Filesystem mặc định của Render không bền vững qua deploy. Hãy dùng Persistent Disk hoặc đồng bộ file hoàn chỉnh lên Google Drive/S3/OneDrive.
