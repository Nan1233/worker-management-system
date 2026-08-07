# Sửa quyền hiển thị công đoạn theo công nhân - 05/08/2026

## Đã sửa
- Trang `SelectProcess` chỉ hiển thị công đoạn có trong `process_ids` hoặc `process_codes` của `/api/workers/me`.
- Hiển thị thông báo khi công nhân chưa được phân công công đoạn.
- Chặn mở trực tiếp URL `/worker/process/:process` nếu công nhân không thuộc công đoạn.
- Hai trang công nhân gọi `/workers/me` với `forceRefresh=true` để không dùng phân công cũ trong session cache.
- Backend xóa `workerProfileCache` ngay sau khi cập nhật tài khoản/phân công công đoạn.

## Kiểm tra
- Backend: `npm run check` đạt, 92 file JavaScript hợp lệ.
- Frontend chưa thể build trong môi trường đóng gói do registry nội bộ thiếu gói `zod-validation-error@4.0.2`. Source TypeScript đã được sửa; chạy `npm install` và `npm run build` trên máy phát triển.

## Build desktop
Desktop lấy frontend từ thư mục ngang cấp `../frontend`. Sau khi giải nén ba thư mục cùng cấp:

```bat
cd frontend
npm install
npm run build

cd ..\desktop
npm install
npm run dist:win
```
