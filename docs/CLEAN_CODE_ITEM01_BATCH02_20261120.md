# KTC — Clean code hạng mục 1/12 · Đợt 2: ProcessPage

**Ngày:** 20/11/2026  
**Nhánh:** `refactor/ktc-local-cleanup`  
**Runtime SHA đã kiểm thử:** `786415afb0897fdfbd65e0d51d95adcd6f6f4249`

## Thay đổi an toàn trong form công nhân

1. `frontend/src/pages/worker/ProcessPage.tsx`: rút handler chọn/bỏ chọn lý do trừ giờ từ **100 dòng còn 11 dòng**, di chuyển quy tắc cập nhật phần chọn và giá trị trừ giờ sang hàm thuần trong `processDeductionLogic.ts`.
2. Hai hàm mới `toggleSelectedDeductionKeys` và `transitionSelectedDeduction` giữ nguyên logic cũ: chọn key mới không tạo trùng; chọn lại giữ nguyên array; bỏ chọn gỡ key và xóa giá trị; chọn lại giữ lượng phút đã nhập; không sửa đối tượng đầu vào.
3. Rút phần kiểm tra **form đang có dữ liệu để xác nhận trước khi làm mới** khỏi `ProcessPage.tsx` sang `processFormResetGuard.ts` (`hasProcessReportInput`). Điều kiện cũ được giữ: thông tin máy/sản phẩm, thời gian thực tế, OK, NG, lựa chọn trừ giờ/NG và số lượng/giờ của từng máy. Trường `0` không tự được tính là dữ liệu đã nhập.
4. Thêm `frontend/tests/process-page-reset-deduction-refactor.test.cjs` gồm bốn test kiểm tra tính thuần/idempotency, giữ/xóa thời gian trừ, kích hoạt xác nhận khi form có dữ liệu, và giữ lời gọi `buildProductionReportPayloads`.
5. Workflow `.github/workflows/phase2-consolidated-safe.yml` tự chạy khi các file nguồn/test mới thay đổi và chạy các test mới ở cổng Frontend.

**Ngoài phạm vi đợt 2:** không chỉnh payload submit, tính KPI, định mức, quản lý máy dùng chung, logic lưu nháp/offline, DB schema hoặc các API có side effect. Các luồng này được giữ nguyên và kiểm tra bằng hồi quy.

## Kết quả CI trên cùng runtime SHA

| Bộ kiểm tra | GitHub Actions run | Kết quả |
|---|---|---|
| Hồi quy tổng hợp | [44685714852](https://github.com/Nan1233/worker-management-system/actions/runs/44685714852) | **6/6 jobs SUCCESS**; Frontend unit/lint/typecheck/build, Backend, browser route/security, Excel parity và Windows |
| Nghiệm thu cô lập | [44685715036](https://github.com/Nan1233/worker-management-system/actions/runs/44685715036) | **3/3 jobs SUCCESS**; Backend/TiDB integration, Playwright **22 passed, 0 flaky**, Windows Setup/Portable staging |

CI dùng cơ sở dữ liệu thử nghiệm cô lập và workbook synthetic, không chứng minh hệ thống đã triển khai hoặc đồng bộ dữ liệu thật.

## Việc tiếp theo trong hạng mục 1/12

`ProcessPage.tsx` vẫn còn lớn vì các luồng duplicate submit, phân tách nhiều báo cáo máy, offline queue và validation phức tạp. Không di chuyển các đoạn có side effect xuyên module nếu chưa có kiểm thử tương đương.

Thứ tự dự kiến:
1. Phân tách kiểm tra dữ liệu form công nhân (validation) theo quy tắc thuần, có test cho giới hạn 12 giờ, NG, ca và máy dùng chung.
2. Rà soát/clean luồng duplicate và split submit, bảo toàn idempotency và báo cáo đã được server xác nhận.
3. Sau khi Frontend ổn định, kiểm tra module giao dịch Backend `productionTempApprovalModel.js`; rồi schema/render Excel Desktop `monthlyWorkbookLocal.cjs`.
4. Mỗi đợt đều phải PASS CI trước khi được xem là hoàn tất, không merge hoặc deploy tự động.

**Trạng thái:** đợt 2 **PASS CI**, nhưng hạng mục **clean code toàn repo vẫn đang thực hiện**. Production: **NO-GO** cho đến khi đạt nghiệm thu PC thực tế, Excel–DB, backup/restore staging và ký phát hành.
