# Excel cột động theo danh mục DB

File Excel tháng và file Excel theo công đoạn không còn phụ thuộc mẫu 53 cột cố định.

Thứ tự cột:
STT, Mã nhân viên, Tên, Số máy, Ca, % học việc, Thời gian làm việc,
Thời gian làm thực tế, Tổng trừ h, [các loại trừ giờ active], Loại SP,
Định mức, TT, Tỷ lệ đạt, Ngày/Tháng, Số SP/H, OK, Tổng NG, Tỷ lệ NG,
[các loại lỗi NG active], Trạng thái, Ghi chú, ID báo cáo.

Danh mục động lấy từ deduction_types và defect_types theo process_id với status='active',
sắp xếp theo sort_order rồi id. Ngày chỉ hiển thị dd/mm/yyyy.
