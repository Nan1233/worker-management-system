# Sửa lỗi phiên tài khoản cũ ghi đè tài khoản mới

- Trang `/login` luôn hủy refresh đang chạy và xóa access token, refresh token, user cũ.
- Không tự chuyển khỏi trang login chỉ vì localStorage còn token cũ.
- Trước mỗi request đăng nhập, tiếp tục tăng auth generation và xóa phiên cũ.
- Response refresh thuộc generation cũ không được phép lưu lại.
- Khi login trả 401/403, ứng dụng giữ trạng thái đăng xuất và không gọi `/workers/me` bằng token cũ.
