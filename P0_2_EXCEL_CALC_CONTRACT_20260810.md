# KTC P0.2 - Excel Calculation Contract (2026-08-10)

## Mục tiêu
Đảm bảo dữ liệu Excel 9 công đoạn dùng đúng calculationSnapshot từ backend và không lệch nghiệp vụ KQD / multi-machine.

## Thay đổi chính
1. `processExcelExportService.js` join `product_standards` để lấy `exclude_kqd_from_tt` đúng theo `process_id + product_code`.
2. Sau khi tải `production_report_machine_lines`, service dựng `machinePerformance` bằng `calculateReportPerformance()` mà không ghi đè snapshot gốc trong `production_reports`.
3. `companyExcelDataController.js` công bố đúng contract hiện tại:
   - `mode: SPLIT_MONTHLY_WORKBOOKS`
   - `expectedFileCount: 10` (1 tổng hợp + 9 công đoạn)
   - `calculationContractVersion: 2`
4. Bổ sung regression tests để khóa KQD policy, multi-machine aggregate và split workbook contract.

## Kết quả kiểm tra trong workspace
- Backend tests: 96/96 PASS.
- Backend source check: PASS.
- Desktop check: PASS.
- Excel <-> DB source contract: PASS.
- `smoke:excel`: chưa chạy được trong workspace đóng gói vì ZIP không chứa dependency `exceljs`. Trên máy dự án hãy chạy `npm run install:all` trước `npm run verify` / `npm run build:exe`.

## Lưu ý nghiệp vụ
- KQD chỉ bị loại khỏi counted output khi cấu hình product standard có `exclude_kqd_from_tt = 1`.
- Tổng NG chất lượng vẫn giữ toàn bộ NG để tính tỷ lệ NG theo contract hiện tại.
- Multi-machine dùng aggregate counted/max từ các machine line đã lưu trong DB.
