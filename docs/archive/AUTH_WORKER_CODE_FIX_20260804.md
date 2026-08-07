# Sửa hiển thị mã công nhân

- API đăng nhập và refresh trả thêm `worker_code`.
- JWT chứa `worker_code` để phục hồi phiên sau deploy.
- Session refresh truy vấn `workers.worker_code`.
- Không đổi `users.username`; P599 tiếp tục là tài khoản nội bộ, 599 là mã hiển thị và mã đăng nhập công nhân.
