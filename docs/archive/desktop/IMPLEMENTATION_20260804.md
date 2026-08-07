# KTC process forms 2026-08-04

- `work_date`: ngày báo cáo do công nhân chọn, dùng để phân nhóm và chèn khoảng cách giữa ngày.
- `entry_date`: ngày thực tế nhập báo cáo, hiển thị tại cột Ngày/Tháng nằm giữa bảng.
- `extra_data`: trường riêng theo công đoạn, lưu JSON để không phá schema cũ.
- Công đoạn bổ sung: DO=60001, CAN=60002, EP=60003, XLBV=60004, SX3=60005.
- Chạy `backend/migration_process_forms_20260804.sql` trước khi deploy.
- Dữ liệu kiểm thử: `backend/tests/fixtures/process-form-test-data.json`.
