# Sửa ngày báo cáo cho ca C - 27/07/2026

- Khi công nhân chuyển từ ca A/B/D sang ca C, ngày báo cáo tự động lùi 1 ngày.
- Khi đổi từ ca C sang ca khác, ngày tự động cộng lại 1 ngày để tránh lệch ngày khi chọn nhầm ca.
- Phép cộng/trừ ngày dùng giờ địa phương, xử lý đúng khi qua đầu tháng hoặc đầu năm.
- Payload gửi API tiếp tục dùng `form.workDate`, vì vậy kiểm tra trùng và lưu báo cáo đều dùng ngày đã điều chỉnh.
