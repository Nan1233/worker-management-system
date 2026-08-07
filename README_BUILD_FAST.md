# Build EXE nhanh, không chỉnh hệ thống

## Kiểm tra nhanh

Chạy `desktop\build-test-fast.bat`. Lệnh tạo `release\win-unpacked` và mở ứng dụng ngay, không nén Portable.

## Tạo Portable

Chạy `desktop\build-portable-fast.bat`. Mỗi lần build tạo tên EXE mới kèm thời gian.

Cấu hình đã tối ưu:

- Không đưa toàn bộ `node_modules/**/*` vào `files`; electron-builder tự lấy dependency runtime.
- `exceljs` và `jszip` vẫn nằm trong `dependencies` nên được đóng gói.
- Dùng `compression: store` để giảm thời gian nén.
- Tắt `signAndEditExecutable` cho bản nội bộ chưa có chứng thư ký mã.
- Tắt tự dò chứng thư bằng `CSC_IDENTITY_AUTO_DISCOVERY=false`.
- File Portable có timestamp nên không ghi đè bản đang bị khóa.

Bản `store` sẽ lớn hơn bản nén, đổi lại build nhanh hơn.
