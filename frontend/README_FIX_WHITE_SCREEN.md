# Sửa màn hình trắng desktop

- Chuyển frontend Electron từ `BrowserRouter` sang `HashRouter` để hoạt động đúng khi mở bằng `file://` trong bản đóng gói.
- Giữ `base: './'` trong Vite để asset được tải bằng đường dẫn tương đối.
- Thêm `DesktopErrorBoundary` để hiển thị lỗi giao diện thay vì trang trắng và ghi lỗi vào desktop log.

## Chạy thử

```cmd
npm install
npm run start
```

## Đóng gói EXE

```cmd
npm run dist:win
```

File tạo trong thư mục `release`.
