# Excel -> DB false-diff hotfix — 2026-08-11

## Đã sửa

- Không còn hiểu cột Trừ giờ/NG không tồn tại trong workbook là yêu cầu xóa dữ liệu DB.
- Các detail DB không có cột editable tương ứng trong Excel được giữ nguyên.
- Các detail có cột trong Excel vẫn có thể chỉnh hoặc xóa bằng cách đặt ô về 0/trống.
- So sánh preview dùng canonical deep comparison, không phụ thuộc thứ tự key object.
- Chỉ report có ít nhất một field thay đổi thật mới xuất hiện trong popup.
- Payload Excel -> DB chỉ chứa field thật sự thay đổi, không gửi lại toàn bộ report.

## Case mục tiêu

Nếu DB report #2 có SL OK 3600 và người dùng chỉ sửa ô Excel thành 3800, preview phải chỉ có:

- Báo cáo #2
- SL OK: 3600 -> 3800

Không được xuất hiện report #4/#5 nếu không sửa và không được tạo diff giả cho Trừ giờ/NG.
