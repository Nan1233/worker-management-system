# Excel ↔ DB Upgrade

## Cách hoạt động
1. Desktop tạo 9 file công đoạn như trước.
2. Mỗi file công đoạn có sheet `_KTC_SYNC` ở trạng thái `veryHidden` chứa ID, `updated_at`, operation mode và snapshot gốc.
3. Desktop kiểm tra file đã lưu mỗi 20 giây.
4. Nếu các ô cho phép thay đổi khác snapshot, Desktop POST tối đa 100 dòng/lần tới `/api/production/excel-sync`.
5. Backend dùng cùng service update với màn hình web: validate master data, period lock, audit version, activity log.
6. Sau khi DB nhận thay đổi, Desktop rebuild workbook từ DB để cập nhật công thức và metadata.

## Ô Excel được phép sync
### Báo cáo thủ công
- Ca
- Máy
- Mã SP
- % học việc
- Thời gian thực tế
- OK
- Chi tiết thời gian trừ
- Chi tiết NG
- Ghi chú

Tổng thời gian, tổng thời gian trừ, tổng NG và actual output được backend tính/chuẩn hóa lại từ dữ liệu chi tiết.

### Báo cáo máy / multi-machine
Chỉ:
- % học việc
- Ghi chú

Các dòng máy phải sửa từ ứng dụng để giữ đúng aggregate và validation.

## Cột không sync
- STT
- thời gian nhập
- mã/tên nhân viên
- định mức
- tổng SP quy đổi
- SP/giờ
- tỷ lệ đạt
- tỷ lệ NG
- trạng thái
- ID

Các cột này có thể bị người dùng sửa hiển thị trong Excel nhưng Desktop không gửi chúng vào DB; lần rebuild tiếp theo sẽ lấy lại từ DB.

## Bảo vệ xung đột
- Excel cũ + DB đã thay đổi => HTTP 409 `REPORT_VERSION_CONFLICT`.
- Kỳ khóa => HTTP 423 `REPORTING_PERIOD_LOCKED`.
- Worker/Lead => không có quyền Excel→DB; chỉ Admin/Manager.
- Xóa dòng trong Excel không xóa DB.
- Mọi update từ Excel ghi `REPORT_UPDATED_FROM_EXCEL` và tạo report version.
