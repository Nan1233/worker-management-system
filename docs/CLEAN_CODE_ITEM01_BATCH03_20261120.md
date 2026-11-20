# KTC — Hạng mục 1/12 · Clean code đợt 3: Validation form công nhân

**Ngày:** 20/11/2026  
**Nhánh:** `refactor/ktc-local-cleanup`  
**Runtime SHA đã kiểm thử:** `9ccaa26e53f05f4a06fc61b7529410e538110390`

## Đã thực hiện

### Tách kiểm tra dữ liệu khỏi `ProcessPage.tsx`

Tạo `frontend/src/pages/worker/processFormValidationRules.ts`, chuyển các điều kiện thuần sang 6 hàm:
1. `validateWorkerShift`: ca A/B/C/D (giữ xử lý chữ hoa và khoảng trắng).
2. `validateCustomReasonNames`: yêu cầu tên NG khác và thời gian trừ khác ở form chung/từng máy, giữ số thứ tự dòng lỗi.
3. `validateManualMachineData`: không cho công đoạn làm tay mang dữ liệu máy.
4. `validateReportTime`: giữ nguyên thứ tự lỗi và các điều kiện về thời gian thực tế, phút, trừ giờ, tổng tối đa 12 giờ.
5. `validateReportTotals`: giữ kiểm tra định mức dương (trừ CVK), số lượng không âm, TT NG bằng tổng lỗi; riêng báo cáo theo dòng máy không dùng công thức tổng của báo cáo làm tay.
6. `validateRequiredExtraFields`: giữ nguyên thông báo thiếu trường riêng của công đoạn.

`ProcessPage.tsx` tiếp tục gọi `validateWorkerWorkDate`, `validateSharedReportNumbers` và `validateMachineLines` theo đúng thứ tự cũ, không thay đổi hàm submit hay payload.

Thêm `frontend/tests/process-form-validation-rules.test.cjs` (8 test): mã ca, lý do khác, máy của công đoạn làm tay, ranh giới 12h, định mức, KQD/NG, trường riêng bắt buộc, các dòng máy và thứ tự validation. Test này được chạy trong workflow Phase 2.

**Không thay quy tắc nghiệp vụ đang có:** bộ kiểm tra thời gian của form hiện tại vẫn kiểm tra thực tế + trừ giờ `<= 12h` đối với dòng không dùng machine-line accounting; đây là logic tồn tại trước refactor. Nếu muốn đổi theo quy tắc chuẩn trên backend, phải đối chiếu và phê duyệt nghiệp vụ riêng, không đổi lén trong clean code.

### Khắc phục vấn đề phát hiện trong hồi quy

E2E của đợt 3 phát hiện test sửa báo cáo đã duyệt đôi lúc không giữ `TT OK = 35` sau thao tác `fill()` (giá trị quay về 40). Đây là lỗi không ổn định đã từng xuất hiện, **không chứng minh do refactor validation**.

- Bỏ cập nhật `setSelectedNg` / `setSelectedDeduction` lồng bên trong functional updater khi hydrate form.
- Cho phép nhận sự kiện native `input` bên cạnh React `change` cho ô TT OK trên form sửa; chặn state update dư thừa khi số liệu không thay đổi.
- Xác minh qua hai lượt browser với dấu vết, sau đó bỏ mã chẩn đoán. E2E chính được sửa để thao tác gõ phím thực tế (`pressSequentially`) và kiểm tra giá trị trước khi gọi PUT.
- **Lưu ý:** lượt kiểm thử sạch cuối xác nhận luồng gõ phím thực tế. Chưa tuyên bố mọi trường hợp dán/chèn tự động (paste/programmatic fill) đều ổn định tuyệt đối; cần UAT bổ sung nếu công nhân sử dụng các thao tác đó.

## Kết quả CI cuối trên cùng SHA

| Cổng | Run | Kết quả |
|---|---|---|
| Phase 2 consolidated | [44688914622](https://github.com/Nan1233/worker-management-system/actions/runs/44688914622) | **6/6 SUCCESS**: backend source, frontend lint/typecheck/build và unit/contract, browser smoke, Excel parity, Windows |
| Three-part isolated acceptance | [44688914691](https://github.com/Nan1233/worker-management-system/actions/runs/44688914691) | **3/3 SUCCESS**, E2E Chromium desktop/mobile **22 passed, 0 flaky**; TiDB cô lập và Windows Setup/Portable staging |

Các lượt CI trung gian có E2E flaky đã được ghi nhận và không dùng làm bằng chứng chốt. Công đoạn này chỉ được đánh dấu đạt trên SHA cuối nêu ở trên.

## Phạm vi còn lại

- **Hạng mục 1/12:** clean code **3/8 đợt đã PASS**; còn 5 đợt theo kế hoạch ước tính.
- **Đợt 4:** tách/rà soát duplicate submit, split theo máy, idempotency, offline queue; test mất mạng, response thất lạc và gửi lại.
- Sau đó: Backend giao dịch/model; Desktop Excel/đồng bộ; Electron IPC/cấu hình; kiểm tra toàn repo.

**Không merge vào main, không deploy Cloudflare, không chỉnh TiDB production.** Đợt 3 chỉ đáp ứng cổng CI; vẫn **NO-GO production** cho tới khi UAT Windows, đối soát Excel–DB trên staging, backup/restore và ký số đạt.
