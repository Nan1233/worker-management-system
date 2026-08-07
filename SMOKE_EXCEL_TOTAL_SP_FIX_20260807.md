# Smoke Excel Total SP Fix - 2026-08-07

- Không thay đổi công thức Tổng SP trong workbook.
- Sửa smoke test `desktop/scripts/smokeExcel.cjs` để xác định dòng CẮT/LỒNG trong sheet `TỔNG HỢP THÁNG` theo tên công đoạn thay vì hard-code dòng 5.
- Lý do: thứ tự tổng hợp hiện là CÁN, ÉP, XỬ LÝ BAVIA, CẮT/LỒNG, ... nên dòng 5 thuộc CÁN và có thể null khi không có dữ liệu.
- Kỳ vọng nghiệp vụ vẫn giữ nguyên: GC có kết quả SP quy đổi 0, 47, 47 => Tổng SP cuối cùng = 47.
