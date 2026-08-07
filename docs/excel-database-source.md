# Nguồn dữ liệu Excel

Luồng báo cáo tháng chỉ dùng dữ liệu đã duyệt trong TiDB:

- `production_reports`: thông tin chính và snapshot định mức/sản lượng.
- `production_report_deductions`: chi tiết thời gian trừ, ghép bằng `report_id` và `deduction_type_id`.
- `production_report_defects`: chi tiết NG, ghép bằng `report_id` và `defect_type_id`.
- `production_report_machine_lines`: chi tiết máy thực tế của báo cáo.
- `workers`, `users`, `processes`: mã công nhân, tên và công đoạn.

Không lấy định mức hiện tại từ `product_standards` để ghi đè snapshot lịch sử. Không tự gán 100% học việc, không tự cộng OK + NG để thay `actual_output`, và không tự đổi trạng thái thành `approved` khi DB không trả giá trị.

Các chỉ số SP/giờ và tỷ lệ đạt chỉ được suy ra từ các snapshot DB tương ứng khi đủ dữ liệu đầu vào; nếu thiếu, ô Excel để trống.
