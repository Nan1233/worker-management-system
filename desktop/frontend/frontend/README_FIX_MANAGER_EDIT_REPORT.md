# Sửa chức năng quản lý chỉnh sửa báo cáo

- Thay trang placeholder `manager/EditReport.tsx` bằng form sửa báo cáo hoàn chỉnh.
- Phân biệt API theo nguồn:
  - Chờ duyệt: `PUT /api/production-temp/:id`
  - Đã duyệt: `PUT /api/production/:id`
- Tự đồng bộ TT NG, sản lượng thực tế, giờ trừ và giờ thực tế trước khi lưu.
- Hiển thị lỗi validation do backend trả về.
- Đồng bộ thay đổi vào frontend nhúng trong bản Desktop.
