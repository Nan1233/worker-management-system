# Tối ưu code và khả năng bảo trì

## Đã thay đổi

- Xóa Axios client cũ `src/api/axios.ts`.
- Toàn bộ service và page dùng chung `src/services/api.ts`.
- Gom URL API và timeout vào `src/config/env.ts`.
- Gom đọc, ghi, xóa token vào `src/utils/authStorage.ts`.
- Loại bỏ MUI và Emotion vì dự án không sử dụng.
- Xóa asset mẫu Vite/React, file zip lồng và source sao chép.
- Dọn tài liệu sửa lỗi cũ khỏi thư mục gốc.
- Thêm `.env.example`, tài liệu kiến trúc và script kiểm tra tổng hợp.

## Kiểm tra trước deploy

```bash
npm ci
npm run check
```

## Deploy Render

- Build Command: `npm ci && npm run build`
- Publish Directory: `dist`
