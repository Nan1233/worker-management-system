# KTC Pilot Readiness Gate — 2026-08-10

Bản nâng cấp này tập trung vào khả năng pilot thực tế, không thêm nghiệp vụ mới.

## Các thay đổi
- Hàng đợi offline có trạng thái hiển thị trực tiếp, xem lỗi, retry thủ công và xóa có xác nhận.
- Retry tự động vẫn giữ nguyên `client_request_id`; report bị lỗi nghiệp vụ giữ trạng thái blocked thay vì spam API.
- Nhật ký hệ thống hiển thị metadata có nhãn tiếng Việt; hỗ trợ bảng before -> after khi log chứa `old_data/new_data/changed_fields`.
- Tab Giám sát đọc thêm `/api/health/ready` và hiển thị banner `Sẵn sàng phục vụ/Chưa sẵn sàng`.
- Thêm `npm run pilot:readiness` để gom các gate rollout.

## Gate pilot
```cmd
set KTC_PILOT_EXCEL_DIR=C:\Users\Mr Thang\Documents\KTC\Bao cao san xuat\2026\08
set KTC_PILOT_MONTH=2026-08
set KTC_PILOT_BACKUP_FILE=C:\path\to\backup.sql.gz
set KTC_PILOT_RUN_LOAD=1
npm run pilot:readiness
```

Không cấu hình Excel/backup/load thì các gate đó được đánh dấu SKIP, không giả vờ PASS.
