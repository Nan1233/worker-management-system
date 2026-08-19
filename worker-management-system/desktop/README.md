# KTC Production Control Desktop

Desktop Electron tích hợp frontend KTC và tự động xuất Excel theo dữ liệu backend.

## Chức năng giữ lại
- Chạy frontend React trong Electron.
- Đồng bộ Excel tự động và thủ công.
- Xuất hai mẫu Gia công và Mài - Đo.
- Hiển thị đầy đủ nhiều máy từ trường `machine_lines`.
- Giữ riêng thời gian công nhân và thời gian từng máy ở backend/frontend.

## Cài và chạy
```powershell
npm install
npm run start
```

## Đóng gói Windows
```powershell
npm run dist:win
```

File cài đặt được tạo trong thư mục `release`.
