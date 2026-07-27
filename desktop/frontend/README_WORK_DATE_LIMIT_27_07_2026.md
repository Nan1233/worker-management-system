# Giới hạn ngày nhập báo cáo công nhân

- Ngày tối đa: ngày hiện tại theo thiết bị.
- Ngày tối thiểu: 14 ngày trước ngày hiện tại.
- Tổng số ngày có thể chọn: 15 ngày nếu tính cả hôm nay.
- Không hiển thị/không cho chọn ngày tương lai.
- Ca C vẫn lùi một ngày và được chặn trong giới hạn trên.
- Frontend kiểm tra trước khi gửi; backend kiểm tra lại để không thể gọi API vượt giới hạn.
