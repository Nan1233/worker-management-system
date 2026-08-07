# Frontend KTC - Cắt/Lồng nhiều máy

- Giữ nguyên thời gian làm việc thực tế của công nhân.
- Công đoạn Cắt/Lồng có lựa chọn Cắt hoặc Lồng, Tay hoặc Máy.
- Khi chọn Máy, cho phép chọn 1-4 máy và nhập giờ/phút riêng cho từng máy.
- Gửi `operation_type`, `operation_mode` và `machine_lines` tới backend.
- Không cho chọn trùng máy; kiểm tra thời gian từng máy.

Lưu ý kiểm tra: môi trường đóng gói không tải được một dependency từ npm registry nội bộ nên chưa chạy được build hoàn chỉnh. Source đã được kiểm tra cân bằng cú pháp và cần chạy `npm ci && npm run build` trên máy dự án trước khi deploy.
