# DB-first Excel sync — 2026-08-11

Luồng Desktop được đổi thành 2 bước bắt buộc:

1. `Cập nhật Excel từ DB` cho tháng đang chọn.
2. Chỉ sau khi bước 1 thành công mới cho `Cập nhật DB từ Excel` trong cùng phiên/tháng.

Bảo vệ dữ liệu:
- Nếu workbook có chỉnh sửa local chưa sync, DB -> Excel vẫn bị chặn để không ghi đè mất dữ liệu.
- Sau DB -> Excel thành công, tháng baseline được lưu trong `sessionStorage`.
- Sau Excel -> DB thành công, Desktop rebuild Excel từ DB và baseline tháng được giữ ở trạng thái mới nhất.
- Đổi tháng yêu cầu thực hiện lại bước 1 cho tháng mới.

Files changed:
- `frontend/src/pages/manager/ApprovedReports.tsx`
