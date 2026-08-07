# KTC Excel export - stable DB-only build

## Nguyên tắc
- Chỉ xuất `production_reports` đã duyệt trong TiDB.
- Chi tiết trừ giờ, NG và máy được ghép theo `report_id` và type ID.
- Không đọc dữ liệu minh họa từ template.
- Workbook được dựng mới bằng ExcelJS với cấu trúc đơn giản, không sửa XML/merge metadata của template.
- Desktop tạo 9 file công đoạn riêng và 1 file tổng hợp chung (10 file/tháng).
- Trước khi build Portable, `npm run smoke:excel` tạo rồi đọc lại đủ 10 file workbook tháng.

## Chạy
```bat
cd /d C:\VSCode\worker-management-system
commit-and-build-portable.bat
```
