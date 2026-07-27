# Giới hạn tổng thời gian 12 giờ

- Tổng thời gian = thời gian thực tế + tổng thời gian trừ.
- Tổng thời gian tuyệt đối không vượt quá 12 giờ.
- Khi giờ thực tế bằng 12, phút tự động về 0 và ô phút bị khóa.
- Không cho tăng giờ, phút hoặc thời gian trừ nếu giá trị mới làm tổng vượt 12 giờ.
- Backend kiểm tra lại và trả 422 với request vượt giới hạn.
