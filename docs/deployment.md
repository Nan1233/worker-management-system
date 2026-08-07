# Triển khai

1. Chạy `npm run verify` tại thư mục gốc.
2. Commit toàn bộ source từ thư mục gốc.
3. Push nhánh `main`; Render tự triển khai backend và frontend.
4. Khi frontend thay đổi, xóa build cache Render và service worker trình duyệt.
5. Build EXE bằng `npm run build:exe` từ đúng commit đã triển khai.
