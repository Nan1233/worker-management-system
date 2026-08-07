# KTC Excel export - stable DB-only build

## Nguyên tắc
- Chỉ xuất `production_reports` đã duyệt trong TiDB.
- Chi tiết trừ giờ, NG và máy được ghép theo `report_id` và type ID.
- Không đọc dữ liệu minh họa từ template.
- Workbook được dựng mới bằng ExcelJS với cấu trúc đơn giản, không sửa XML/merge metadata của template.
- Có đủ 9 sheet công đoạn và một bìa tổng hợp.
- Trước khi build Portable, `npm run smoke:excel` tạo rồi đọc lại cả hai workbook.

## Chạy
```bat
cd /d C:\VSCode\worker-management-system
commit-and-build-portable.bat
```
