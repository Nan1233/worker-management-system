# KTC Excel stabilization 2026-08-11

Mục tiêu của bản này là khóa contract Excel thay vì thêm feature mới.

## Thay đổi chính
- Một whitelist dùng chung cho Desktop và Backend: chỉ field đầu vào nghiệp vụ mới được Excel -> DB.
- Các field dẫn xuất/hệ thống (SP quy đổi, định mức, tổng thời gian, tổng NG, trạng thái, worker/process id...) không thể được patch trực tiếp từ Excel.
- Workbook `_KTC_SYNC` mang contract version. File cũ bị chặn và yêu cầu DB -> Excel trước khi sync ngược.
- `npm run verify` chạy thêm `verify:excel-contract` trước các suite hiện có.
- Smoke Excel kiểm tra contract version, helper Cắt/Lồng không kéo dòng TỔNG CỘNG, nhãn CẮT/LỒNG/TAY/MÁY tiếng Việt, tổng SP quy đổi và quy tắc ngày/STT.
- Màu workbook tiếp tục dùng palette tập trung `COLORS`; contract test cấm hard-code ARGB trực tiếp trong exporter.

## Contract Excel -> DB
Được phép: work_date, shift, operation_type, operation_mode, machine_no, product_name, training_percent, actual_time, tt_ok, deductions, defects, note.

Không được patch trực tiếp: total_time, deduction_time, standard_output, actual_output, tt_ng, output_per_hour, achievement_rate, ng_rate, status, worker_id, process_id, reviewed_by, approved_at, updated_at, version.

Backend vẫn là nguồn chuẩn để validate và tính lại dữ liệu dẫn xuất.
