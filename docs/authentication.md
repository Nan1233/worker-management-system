# Xác thực và phân quyền công đoạn

`GET /api/workers/me` dùng xác thực đầy đủ và trả `processes[]`. Frontend chỉ hiển thị các công đoạn trong danh sách này. Backend luôn kiểm tra lại `worker_processes` khi ghi báo cáo.
