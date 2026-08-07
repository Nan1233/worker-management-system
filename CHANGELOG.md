# Thay đổi

- Sửa quyền công đoạn theo từng công nhân.
- Bổ sung cấu trúc `processes[]` cho hồ sơ công nhân.
- Chặn tài khoản/công nhân không hoạt động.
- Bảo vệ API NG và trừ giờ bằng xác thực đầy đủ.
- Xóa Electron trùng, template ZIP và file rác.
- Thêm kiểm tra toàn dự án và tên EXE không kèm phiên bản.

## Cải tiến hồ sơ và quyền công đoạn

- Tách truy vấn hồ sơ công nhân sang service có thể kiểm thử độc lập.
- Chỉ tìm worker theo `user_id` của phiên đăng nhập.
- Chặn tài khoản và hồ sơ worker không hoạt động ngay trong truy vấn.
- Loại bỏ `GROUP_CONCAT` và truy vấn quyền trùng lặp.
- Chuẩn hóa `processes[]` và sinh trường CSV tương thích từ cùng một nguồn.
- Thêm integration test cho hồ sơ công nhân và công đoạn được phân công.
- Thêm GitHub Actions dùng Node 22 và `npm ci` cho cả ba thành phần.

## Worker API and release hardening
- Standardized `/api/workers/:workerId` and training-percent routes on `workers.id`.
- Reused one worker profile loader for current and management profile endpoints.
- Made structured `processes[]` authoritative in the frontend, with legacy CSV fallback only when absent.
- Reduced current worker cache TTL to 60 seconds.
- Stabilized manager report loading hooks.
- Added Windows EXE build workflow and worker ID regression tests.

## Excel dùng dữ liệu thật trong DB

- Xuất trực tiếp snapshot từ `production_reports`.
- Ghép NG, trừ giờ và máy theo đúng `report_id` và type ID.
- Không dùng `product_standards` hiện tại để ghi đè báo cáo lịch sử.
- Bỏ fallback 100% học việc, OK + NG thay sản lượng, trạng thái duyệt giả và mã máy/sản phẩm giả.
- Ô thiếu dữ liệu trong DB được để trống; không tự sinh số liệu.

## Database-only Excel export and Render connectivity fix
- Excel reads approved rows from `production_reports`; NG/trừ giờ/máy are joined by `report_id`.
- Optional `entry_date` and `extra_data` no longer break older TiDB schemas.
- Desktop retries Render cold starts and transient HTTP failures with clearer diagnostics.
- Portable/Setup builds always build and copy `frontend/dist` before packaging.

## Formula settings and achievement colors
- Added management settings per process for adjusted output, actual time, output/hour, achievement and NG-rate formulas.
- Added configurable achievement color thresholds shared with monthly Excel export.
- Adjusted output defaults to worker-entered output multiplied by training percentage.
- Monthly Excel now shows entered output and adjusted output separately, highlights achievement cells, and inserts one spacer row between report dates.

## 2026-08-07 - Monthly Excel business rules unified
- Monthly workbook remains the canonical renderer; it does not use A+B workbooks as templates.
- Preserve 0% training instead of silently converting it to 100%.
- Use one adjusted-output rule per configured process; KQD exclusion only affects counted output when configured.
- Use Total NG / (OK + Total NG) consistently for NG rate.
- Export report date and entry date in separate columns.
- Sort consistently by report date, approval/create time, worker, machine, then report ID.
- Reset STT for every report date, including legacy one-region layout fallback.
- Rename time columns to Tổng thời gian, Thời gian thực tế, Tổng thời gian trừ.
- Add realistic shift-C, zero-training, KQD, date-separation and workbook round-trip smoke assertions.

## 2026-08-07 - Excel integer quantity formatting

- Grouped reports by report date with exactly one blank row between dates.
- Reset STT to 1 for each report date.
- Display STT, OK, total NG, defect details, entered product quantity, converted product quantity and IDs as integers.
- Round calculated converted product quantity to the nearest whole product.
- Keep deduction hours and working-time values at up to two decimal places.
- Keep standards and products-per-hour at up to six decimal places.
- Keep achievement and NG rates as percentages.
- Extended the Excel integration smoke test to verify number formats and the blank separator row.

## 2026-08-07 - Excel integer quantity test fix
- Updated source integrity tests to expect integer production quantities.
- Verified backend test suite: 45/45 passed.

## 2026-08-07 - Excel date separator row
- Each report date now starts with one separator row; cell A contains the form `work_date`.
- Report rows no longer repeat the report date.
- Daily STT resets to 1 immediately after each date row.
- `Thời gian nhập` is taken from the database `created_at` timestamp and displayed with date and time.
- Freeze pane now ends at `Tên NV` after removing the repeated report-date column.
- Smoke/source tests updated for the new layout.

## 2026-08-07 - Excel detail alias test alignment

- Updated `backend/tests/excel-detail-column-robustness.test.js` to validate the current detail resolver architecture.
- Tests now verify `detailId`, `detailCode`, `detailLabel`, `detailAliases`, `detailValue`, and `detailMap` instead of the removed `detailMapValue` helper.
- Added coverage for deduction/defect ID, code, label, hours, and quantity field aliases returned by the database.
- Backend test result: 46/46 passed.

## 2026-08-07 - CI daily grouping/freeze test alignment
- Added `backend/tests/excel-daily-order-freeze.test.js` to the clean source package.
- Freeze validation now matches the current layout: STT, Thời gian nhập, Mã NV, Tên NV (`xSplit: 4`, scroll from `E6`).
- Daily sequence validation now matches the date separator-row implementation and confirms `work_date` is written to column A.
- Added ordering validation for report date followed by actual input/approval time.

## 2026-08-07 - Excel report-date row width fix
- Merge cells A:D only on each report-date separator row.
- Write report date as dd/mm/yyyy text so narrow STT column never displays ###.
- Keep data-row columns unchanged: A STT, B input time, C worker code, D worker name.
- Update CI source assertions and Excel smoke expectations.
## 2026-08-07 - Excel number display fix

- Hide unnecessary trailing decimal zeros (`1.0` -> `1`, `0.0` -> `0`).
- Keep STT, OK, NG, defect quantities, output and ID as integers.
- Allow optional decimals only for time, productivity/rate and percentage fields.
- Add regression tests for Excel number formats.


## 2026-08-07 - Dynamic Excel number formatting
- Whole time and productivity values now use integer number format, preventing Excel 2016 from showing `11.` or `0.`.
- Decimal formats are used only when the stored value actually has a fractional part.
- Quantity fields remain integer-only; percentages keep percentage formatting.
- Added CI coverage for process rows, total rows, summary, reconciliation, and DATA_DB formatting.

## 2026-08-07 - Process-specific form and Excel schema from file-mau.xlsx
- Tách cấu trúc Excel theo 9 công đoạn; giữ cố định các cột NG/trừ giờ đọc từ file-mau.xlsx.
- CÁN: NG Chân không/Rách vỡ/Bề mặt/Bavia; trừ giờ Vệ sinh máy cán/Sửa máy/Nghỉ giải lao/5S/Dừng sản xuất/CAN HC.
- ÉP: NG và trừ giờ riêng theo sheet EP; không dùng chung schema Kiểm 1.
- XLBV và SX3 có nhóm trường riêng theo sheet mẫu.
- Form công nhân tải danh mục trừ giờ theo process từ API/DB, không còn dùng danh sách Gia công cho mọi công đoạn.
- Bổ sung các trường riêng Cán, Kiểm 1 và XLBV theo Form nhập.
- Cột mẫu được ghép với master DB và chi tiết thực tế để không mất loại mới.

## 2026-08-07 - Frontend deduction key build fix
- Fixed TypeScript build errors caused by `keyof DeductionState` widening beyond string-safe DOM/payload values.
- `DeductionKey` now uses `Extract<keyof DeductionState, string>`.
- Deduction payload codes and form `htmlFor`/`id`/`name` are explicitly converted with `String(...)`.
- Added source regression test so CI catches this issue before Electron packaging.

## 2026-08-07 - Render startup module fix
- Restored `backend/services/schemaCompatibilityService.js` required by `processExcelExportService.js`.
- Added cached TiDB `INFORMATION_SCHEMA.COLUMNS` compatibility checks for optional legacy columns.
- Added regression tests that fail when any relative backend `require()` points to a missing deploy-source module.
- Backend tests: 60/60 pass; backend source check passes.
