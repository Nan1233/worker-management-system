# Giới hạn ngày gửi báo cáo công nhân

Backend sử dụng múi giờ Asia/Ho_Chi_Minh và chỉ chấp nhận `work_date` từ 14 ngày trước đến ngày hiện tại đối với worker.
Ngày tương lai hoặc cũ hơn 14 ngày trả HTTP 422.
Áp dụng cho kiểm tra trùng, tạo mới và worker sửa báo cáo chờ duyệt.
