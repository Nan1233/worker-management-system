# KTC — Hạng mục 1/12 · Clean code đợt 4: gửi báo cáo / trùng / offline

**Ngày:** 20/11/2026  
**Nhánh:** `refactor/ktc-local-cleanup`  
**Runtime SHA:** `95396872f3ce7c2e33f2e0e4455d5510bdaea724`

## Đã xử lý

- Tạo `frontend/src/pages/worker/processSubmitBatchSlices.ts` chứa hai phép chọn phần báo cáo theo máy thuần:
  - `reportsUnsentAfterNetworkFailure(payloads, failedIndex)`: trả về **báo cáo đang gửi có kết quả chưa xác định + các báo cáo phía sau**, bỏ qua mọi báo cáo đã được xác nhận trước đó. Giữ nguyên client_request_id để queue retry idempotent.
  - `reportsAwaitingDuplicateConfirmation(payloads, duplicateIndex)`: chỉ lấy **các báo cáo phía sau báo cáo bị phát hiện trùng**, tuyệt đối không tự gửi báo cáo đang cần xác nhận.
- `ProcessPage.tsx` sử dụng hai helper cho cả phản hồi duplicate từ HTTP 409 và response tương tự, cũng như lỗi mạng ở giữa batch; nhánh ngoại tuyến ngay từ đầu vẫn xếp toàn bộ payloads.
- Rút bỏ thao tác tăng `resetVersionRef` và clear timer **bị lặp** trong `finishDuplicateAction`. Giữ nguyên thứ tự vô hiệu hóa autosave, xóa bản nháp đã gửi và điều hướng.
- Thêm **5 bài test** ở `frontend/tests/process-submit-batch-slices.test.cjs`: ranh giới index, giữ nguyên request ID/payload, không gửi lại primary, empty suffix, và hợp đồng đường đi submit/duplicate.
- Chạy cùng các test hiện có về split resume, ghi hàng đợi offline atomic, storage/quota/corruption, request ID collision, giao dịch và giao diện.

## Bằng chứng kiểm thử

- [Phase 2 consolidated run 44689976392](https://github.com/Nan1233/worker-management-system/actions/runs/44689976392): **6/6 PASS** trên runtime SHA, gồm Frontend lint/typecheck/build, unit tests, Backend, Excel và Windows.
- [Three-part isolated acceptance run 44689976301](https://github.com/Nan1233/worker-management-system/actions/runs/44689976301): Backend/TiDB và Windows staging **PASS**; lần E2E đầu **FAIL do một bài mobile admin navigation flaky** (`clickAdminNav` không tìm thấy nút Đã duyệt). Đây là bài kiểm thử điều hướng, không thuộc logic submit được refactor; đã yêu cầu rerun để xác nhận. Không coi E2E đã PASS cho tới khi có kết quả.
- Không dùng retry hoặc bỏ kiểm tra E2E để che lỗi. CI có `failOnFlakyTests`.

## Phần còn lại và giới hạn

- Refactor này không đổi API, server idempotency, transaction hoặc dữ liệu TiDB production. Queue vẫn lưu bền vững theo `client_request_id`.
- Những scenario hiếm vẫn cần UAT: mất kết nối sau khi backend đã nhận nhưng trước khi HTTP trả kết quả, mất điện/đóng app khi queue ghi, khôi phục bản nháp khác tài khoản, và retry nhiều máy khi network chập chờn.
- **Hạng mục 1/12 chưa xong:** Backend transaction/model, Desktop Excel/sync, Electron IPC/packaging và tổng kiểm toàn repo.
- **Production NO-GO:** Chưa chạy UAT trên Windows PC công ty và dữ liệu TEST đối chiếu Excel–DB.

Tài liệu này giữ nguyên dữ kiện CI được quan sát; cập nhật trạng thái E2E cuối sau khi rerun nếu đủ bằng chứng.
