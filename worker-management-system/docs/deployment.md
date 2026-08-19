# Triển khai

## Render — nguồn cấu hình canonical

Repository dùng Render cho production. Cấu hình service nằm trong `render.yaml`:

- Frontend: `rootDir: frontend`, `npm ci && npm run build`, publish `./dist`.
- Backend: `rootDir: backend`, `npm ci`, `npm start`, health check `/api/health/ready`.
- Secrets và database credentials **không commit vào Git**; tiếp tục quản lý trong Render Environment.
- Không sử dụng Vercel hoặc GitHub Actions cho production deployment.

## Trước khi push main

Từ thư mục gốc:

```cmd
npm run verify
```

Lệnh này chạy các release/repository contracts nhẹ. Release candidate đầy đủ dùng `npm run quality:final`.

Sau khi verify PASS:

1. Commit toàn bộ source.
2. `git pull --rebase origin main`.
3. `git push origin main`.
4. Render tự triển khai theo `render.yaml`.

## Sau deploy

Kiểm tra:

- Frontend Render mở được.
- Backend `/api/health/live` trả HTTP 200.
- Backend `/api/health/ready` chỉ trả ready khi database/schema sẵn sàng.
- Login, worker submit, manager approval và Excel export hoạt động.

Khi frontend thay đổi, có thể cần xóa build cache Render và service worker trình duyệt.

Build EXE bằng `npm run build:exe` từ đúng commit đã triển khai nếu script đó tồn tại trong bản release.
