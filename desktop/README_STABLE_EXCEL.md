# KTC Desktop 1.0.3 - Stable Excel

Bản này khôi phục kiến trúc đã chạy ổn định hôm trước:

- Frontend được build và đóng gói trực tiếp trong Electron.
- Frontend gọi IPC desktop trực tiếp, không phụ thuộc frontend Render có kịp cập nhật hay không.
- Excel tổng hợp dùng đúng API POST `/api/reports/export-excel` với body `{ date }`.
- Excel công đoạn dùng `/api/reports/export-excel/processes` và `/api/reports/export-excel/process`.
- File được ghi đè an toàn.
- Thư mục mặc định: `Documents/KTC/Bao cao san xuat/<năm>/<công đoạn>/`.

## Build

```bat
npm install
npm --prefix frontend install
npm run dist:win
```

File xuất ra trong `release`.
