# KTC Desktop FE33 + tự động cập nhật Excel

- `frontend/` là FE33 giống bản web.
- Desktop mở frontend nội bộ, không tải UI từ Render.
- Logic Excel giữ theo desktop đã chạy ổn.
- Tự đồng bộ ngay sau khi phát hiện token đăng nhập, sau thao tác duyệt/sửa dữ liệu đã duyệt và mỗi 5 phút.
- Nút Excel chỉ chủ động chạy cập nhật ngay; không phải điều kiện để dữ liệu tự đồng bộ.
- File được ghi đè tại `Documents/KTC/Bao cao san xuat/<năm>/...`.

## Chạy thử

```bat
npm install
npm run frontend:install
npm start
```

## Đóng gói

```bat
npm run dist:win
```

Không commit `node_modules`, `frontend/dist`, `release` hoặc file `.exe`.
