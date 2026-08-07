# Sửa lỗi ExcelJS "Cannot merge already merged cells"

- Template báo cáo đã được chuẩn hóa, bỏ các vùng merge chồng lấn.
- `monthlyWorkbookLocal.cjs` tự kiểm tra và hợp nhất các vùng merge XML chồng lấn trước khi ExcelJS mở workbook.
- Không tạo lại bố cục template và không merge lại tiêu đề trong lúc ghi dữ liệu.
- Phiên bản desktop: 1.4.8.
