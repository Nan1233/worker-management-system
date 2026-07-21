# KTC Worker Management Desktop

## Chức năng Excel tự động

Sau khi manager/lead/admin đăng nhập, ứng dụng tự đồng bộ Excel mỗi 5 phút.
Backend tạo lại file từ dữ liệu báo cáo đã duyệt mới nhất trong DB, tương tự luồng Google Sheet.

Cấu trúc file trên máy:

Documents/KTC/Bao cao san xuat/<Năm>/<Công đoạn>/<Tháng>/Bao-cao-<công-đoạn>-<tháng>-<năm>.xlsx

Ví dụ:

Documents/KTC/Bao cao san xuat/2026/Gia công/07/Bao-cao-Gia-cong-07-2026.xlsx

- File chưa có: tự tạo.
- File đã có: tự ghi đè, không hỏi Replace.
- File đang mở trong Excel: lưu bản `.pending.xlsx`; chu kỳ sau tự thay thế khi file được đóng.
- Log desktop: `%LOCALAPPDATA%/KTC-Worker-Management/UserData/logs/desktop.log`.

## Cài dependency

PowerShell bị chặn npm.ps1 thì dùng:

npm.cmd install
npm.cmd --prefix frontend install

## Chạy dev

npm.cmd run dev

## Build bộ cài Windows

npm.cmd run dist:win

File cài đặt:

release/KTC-Worker-Management-Setup-1.0.0.exe

## Backend bắt buộc deploy kèm

Desktop dùng hai endpoint:

- GET `/api/reports/export-excel/processes?date=YYYY-MM-DD`
- POST `/api/reports/export-excel/process`

Hãy deploy folder backend đi kèm gói này trước khi dùng desktop.
