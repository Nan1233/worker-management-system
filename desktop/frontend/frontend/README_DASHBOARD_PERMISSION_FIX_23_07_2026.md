# Dashboard permission and KPI fix - 23/07/2026

- Danh sách công đoạn lấy động từ `GET /users/options/processes`.
- API này trả toàn bộ công đoạn active cho admin và chỉ công đoạn được phân cho manager/lead.
- KPI, biểu đồ công đoạn và biểu đồ ca chỉ dùng báo cáo thuộc phạm vi công đoạn được phép.
- Bỏ danh mục 4 công đoạn fix cứng.
- KPI gồm: chờ duyệt, sản lượng OK, tỷ lệ NG, báo cáo đã duyệt.
- Biểu đồ ca dùng sản lượng báo cáo đã duyệt, hiển thị OK/NG.
- Bỏ nút điều hướng lặp ở header.
- Sửa base path cho admin/manager/lead.
