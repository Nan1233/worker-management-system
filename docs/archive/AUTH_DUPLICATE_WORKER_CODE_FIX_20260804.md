# Sửa đăng nhập khi nhiều tài khoản dùng chung mã công nhân

- Ưu tiên tuyệt đối khớp chính xác `users.username`.
- Chỉ dùng `workers.worker_code` làm fallback khi không có username khớp.
- Nếu một worker_code liên kết nhiều user, API trả 409 `ACCOUNT_AMBIGUOUS` và yêu cầu nhập username cụ thể.
- JWT/session tiếp tục định danh bằng `users.id`.
- Frontend ghi nhớ username thật, không gom các tài khoản test về cùng worker_code.
