# Bản sửa ổn định demo – nhóm vấn đề 1–7

## Đã sửa
- Giữ nguyên phân cấp admin → manager → lead → worker.
- Admin gán công đoạn cho manager, lead và worker.
- Manager chỉ tạo/gán lead, worker trong công đoạn mình phụ trách.
- Lead chỉ tạo/gán worker trong công đoạn mình phụ trách.
- Danh sách và chi tiết người dùng được lọc theo phạm vi công đoạn, tránh xem/sửa chéo.
- Dùng thống nhất API `/api/users` để quản lý tài khoản; API manager cũ trả 410 để tránh hai luồng chồng nhau.
- Khóa tài khoản tiếp tục có hiệu lực ngay vì middleware kiểm tra trạng thái DB ở mỗi request.
- Queue DB không reset job đang `processing`; job treo được phục hồi và job hết retry không tiếp tục đặt lịch.
- Chuẩn hóa một số phản hồi lỗi đăng nhập/danh mục để không lộ lỗi database.
- Frontend web và desktop đều hiển thị/gửi phân công công đoạn cho manager, lead, worker.
- Electron bật sandbox và giữ contextIsolation/nodeIntegration an toàn.
- Bổ sung test quy tắc phân cấp và chuẩn hóa process_ids.

## Kiểm tra đã chạy
- Backend: 6/6 test đạt.
- Frontend web: lint đạt, TypeScript/Vite build đạt.
- Frontend desktop: lint đạt, TypeScript/Vite build đạt.

## Lưu ý database
Chạy các migration đã có trong dự án trước khi demo, đặc biệt:
- `migration_reliability_and_sync.sql`
- `migration_audit_notification_version.sql`
- `migration_report_workflow.sql`

Máy kiểm tra không có kết nối tới database TiDB thực tế nên cần chạy smoke test API trên môi trường Render sau deploy.
