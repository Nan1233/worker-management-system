# Thay đổi giao diện worker

- Phần tên công nhân, mã nhân viên và ngày được chuyển thành thanh gọn.
- Thanh này dùng `position: sticky`, luôn nhìn thấy khi cuộn biểu mẫu.
- Trên điện thoại ẩn phần trăm học việc để tiết kiệm chiều cao.
- Tiêu đề mẫu nhập liệu vẫn nằm trong nội dung và không chiếm thanh điều hướng.

Lưu ý: gói `worker.zip` chỉ có các trang trong thư mục `pages/worker`. Component thanh điều hướng toàn hệ thống (phần KTC / Trang chủ / Lịch sử / Thông báo / Đăng xuất) không có trong gói, nên phần logo KTC và việc xóa khối tài khoản bên phải phải sửa tại layout/header của dự án chính.
