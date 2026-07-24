# KTC PWA cho iPhone

## Chạy và build

```bash
npm install
npm run build
npm run preview
```

## Deploy Render

- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Phải dùng HTTPS (Render đã hỗ trợ).

## Cài trên iPhone

1. Mở website bằng Safari.
2. Nhấn nút Chia sẻ.
3. Chọn **Thêm vào Màn hình chính**.
4. Nhấn **Thêm**.
5. Mở ứng dụng từ biểu tượng KTC trên màn hình chính.

## Cập nhật phiên bản

Sau khi deploy bản mới, service worker kiểm tra cập nhật khi mở ứng dụng và định kỳ mỗi giờ. Đóng rồi mở lại ứng dụng để nhận giao diện mới ngay. API và dữ liệu báo cáo luôn lấy trực tiếp từ backend, không cache ngoại tuyến.
