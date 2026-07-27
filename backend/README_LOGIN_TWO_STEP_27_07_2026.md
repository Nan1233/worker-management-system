# Đăng nhập hai bước

- `access_type=worker`: chỉ chấp nhận user role `worker`, không kiểm tra mật khẩu.
- `access_type=management`: chỉ chấp nhận `admin`, `manager`, `lead` và bắt buộc mật khẩu.
- Client cũ không gửi `access_type` vẫn đăng nhập bằng username + password để giữ tương thích.
