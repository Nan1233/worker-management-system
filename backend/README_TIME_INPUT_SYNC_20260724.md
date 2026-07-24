# Đồng bộ nghiệp vụ thời gian 24/07/2026

- Người dùng nhập thời gian làm thực tế bằng hai ô giờ và phút.
- Chi tiết thời gian trừ nhập bằng phút; 70 phút được lưu thành 1.166666... giờ.
- actual_time = giờ thực tế + phút thực tế / 60.
- deduction_time = tổng phút trừ / 60.
- total_time = actual_time + deduction_time.
- Excel và DB tiếp tục nhận số giờ thập phân.
- Backend validate đúng ba đại lượng trên và trang sửa báo cáo dùng cùng quy tắc.
