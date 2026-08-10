# P0.4 Review State / Version Guard - 2026-08-10

## Mục tiêu
Khóa luồng temp -> sửa/gửi lại -> duyệt/từ chối để manager không thể xử lý một bản báo cáo cũ sau khi worker hoặc người quản lý khác vừa thay đổi dữ liệu.

## Thay đổi
- Approve/reject vẫn dùng `SELECT ... FOR UPDATE` và chỉ nhận trạng thái `pending` / `need_fix`.
- Frontend gửi `expected_updated_at` cho từng report khi approve/reject (bulk, review screen, detail screen).
- Backend so sánh token `expected_updated_at` với row đã khóa. Nếu khác trả lỗi HTTP 409 `TEMP_REPORT_VERSION_CONFLICT` và rollback toàn bộ batch.
- Update temp report dùng cùng optimistic-concurrency guard trước mọi mutation.
- Giữ UNIQUE `production_reports.source_temp_id`, vì vậy một temp report không thể sinh hai approved report.
- Giữ audit/action log và transaction hiện có; stale request không tạo audit sai và không thay đổi trạng thái.
- Review screen hiển thị message thực từ backend để manager biết cần tải lại dữ liệu.

## Tương thích
API vẫn nhận `ids` cũ. Client mới gửi thêm `targets` để bật stale-version protection; không cần migration DB vì sử dụng `updated_at` hiện có.

## Verify
- Backend tests: 103/103 PASS.
- Backend source check: PASS.
- Desktop check + Excel <-> DB contract: PASS.
- Frontend build trong sandbox bị chặn do ZIP không kèm type packages `vite/client` và `@types/node`; chạy `npm run install:all` trên máy dự án trước verify/build.
