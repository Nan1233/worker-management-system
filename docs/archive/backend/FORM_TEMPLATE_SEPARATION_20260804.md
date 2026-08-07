# Phân tách nguồn form và nguồn xuất Excel

- Tiêu đề/trường nhập công đoạn được khai báo cứng tại frontend/src/pages/worker/processFormSchemas.ts.
- Ứng dụng không đọc file Excel để dựng form lúc chạy.
- File Excel trong backend/templates là nguồn duy nhất cho luồng xuất báo cáo.
- work_date là ngày công nhân chọn và dùng để nhóm báo cáo.
- entry_date là ngày nhập thực tế và chỉ hiển thị ở cột ngày nhập nếu template có cột đó.
