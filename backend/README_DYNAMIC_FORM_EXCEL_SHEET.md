# Đồng bộ danh mục động

- Form công nhân lấy toàn bộ lỗi NG đang `active` từ `/api/processes/:id/defects`.
- Form dùng `defect_type_id` khi lưu, không phụ thuộc danh sách mã lỗi viết cứng.
- Excel và Google Sheet lấy toàn bộ loại trừ giờ/lỗi NG đang `active` theo công đoạn.
- Ngày hiển thị `dd/mm/yyyy`, không kèm giờ.
- Cột cuối gồm trạng thái, ghi chú và ID báo cáo.
