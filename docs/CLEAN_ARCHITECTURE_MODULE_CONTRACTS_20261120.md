# KTC — Hợp đồng module và checklist hồi quy cho Clean Architecture

**Phạm vi:** nhánh `refactor/ktc-local-cleanup`; refactor cấu trúc, **không thay đổi nghiệp vụ**.  
**Ngày:** 20/11/2026.  
**Trạng thái:** tài liệu quy ước; PASS chỉ được ghi nhận sau khi chạy kiểm thử tại đúng commit.

## Ranh giới trách nhiệm

| Tầng | Được phép | Không được phép |
|---|---|---|
| Presentation | React component/page, HTTP controller, Electron IPC; input/output, trạng thái hiển thị | Quy tắc định mức, NG, giờ máy và SQL trực tiếp |
| Application | Submit, approve/reject, duplicate, offline retry, draft, orchestration; yêu cầu repository | Phụ thuộc React JSX/Express request hoặc viết SQL trong use case mới |
| Domain | Pure functions: sản lượng, NG, thời gian, máy, định mức, chuẩn hóa | Import DB, network, filesystem, Electron hoặc React |
| Infrastructure | SQL/TiDB repositories, API adapters, ExcelJS, lưu file/offline | Tự quyết định nghiệp vụ không được quy định bởi use case/domain |

**Cách chuyển đổi:** migration tăng dần theo feature; service/model cũ là compatibility facade trong quá trình chuyển. Không ép đổi mọi đường dẫn cùng một lúc. Mỗi extraction phải bảo toàn signature, order, transaction và serialization.

## Hợp đồng hiện thực đã tách

1. **Worker quality actions** — `frontend/src/pages/worker/useProcessQualityActions.ts`: nhận `setForm`, `setSelectedNg`, `activeNgOptions`, `calculateActualOutput`; trả về `handleNgValue`, `handleToggleNg`, `handleTtOkChange`. React page còn sở hữu state để draft-restore/reset hoạt động như trước; domain functions trong `processQualityLogic.ts` vẫn là nguồn tính NG và OK.
2. **Worker machine-line actions** — `frontend/src/pages/worker/useProcessMachineLineActions.ts`: giữ giới hạn số máy và cập nhật từng dòng, sử dụng lại `processMachineLines.ts` và `processMachineLineState.ts`. Không làm thay đổi accounting hoặc standard lookup.
3. **Submission request lookup repository** — `backend/repositories/productionSubmissionRequestRepository.js`: `findExistingClientRequest(data, executor = db)`. Có thể truyền cùng executor/transaction; trả `null`, row trực tiếp, hoặc row đầu + `machine_group_ids`. Exact `client_request_id` **luôn ưu tiên** nhóm `gc_group_request_id` / `machine_group_request_id`, các ID nhóm theo `ORDER BY id ASC`. Không đổi SQL predicate.
4. **Submission service** — `backend/services/productionTempSubmissionService.js` tiếp tục sở hữu retry/idempotency decision, lock, transaction, rollback/error semantics; repository chỉ trả dữ liệu truy vấn. Public exports `createCompleteReport` và `enforceDailyWorkerHours` được giữ nguyên.

## Bất biến bắt buộc trước khi merge

- **Worker form:** ngày/ca/công đoạn, CVK/Cắt–Lồng/tay–máy, tất cả trường NG/trừ giờ, tính TT OK/TT NG, <=12 giờ, reset và draft v3 vẫn giữ nguyên.
- **Submission:** một click submit; `client_request_id` được tái sử dụng khi retry đúng yêu cầu; force-duplicate chỉ sau challenge token; báo cáo split đã thành công không gửi lại primary; offline queue không mất bản ghi; 429 không queue sai.
- **Backend:** lỗi 409/422 và response payload không đổi; transaction và row lock vẫn theo cùng boundary; rollback failure không che lỗi gốc; các snapshot định mức/đào tạo theo ngày không bị ghi đè; GC shared-machine physical count không nhân đôi.
- **Approval:** scope `manager_processes`, `expected_updated_at`, pending->approved transition, copy machine lines/defects và post-commit notifications nhất quán.
- **Desktop:** template/sheet/header/style/order, `_KTC_SYNC`, export paths, backup/recovery, IPC trusted sender và preload API không đổi.

## Cổng kiểm tra hiện có (không tạo bộ test nghiệp vụ mới)

Chạy trên checkout **đúng commit HEAD của nhánh refactor**:

```bash
# Trong repository root: kiểm tra regression có sẵn
node --test tests/data-integrity-duplicate-closeout.test.cjs tests/offline-reliability.test.cjs tests/process-page-async-race.test.cjs

# Frontend (trong frontend/)
npm run typecheck
npm run lint
npm test
npm run build

# Backend (trong backend/)
npm run check
npm test

# Desktop/root: chạy các smoke/workbook checks đang tồn tại trong repository,
# không chạy E2E/DB production hoặc đồng bộ xuất thật trong bước refactor.
```

Test source-regex hiện tại có thể fail vì chuyển hàm sang module khác dù hành vi không đổi. Khi gặp loại false positive, điều chỉnh test cũ để kiểm tra interface và hành vi tại điểm gọi; **không** xóa kiểm tra nghiệp vụ hoặc tự tuyên bố PASS.

## Checklist khi review mỗi commit

- [ ] Diff chỉ là di chuyển trách nhiệm, không sửa công thức hoặc SQL behavior
- [ ] Contract input/output, error codes, idempotency, ordering giống trước
- [ ] Các reference/import tại đường dẫn cũ vẫn hoạt động
- [ ] Typecheck/lint/test/build/smoke tại đúng commit đã chạy và ghi kết quả
- [ ] Không chạm production DB, merge, deploy hay các template workbook production

**Lưu ý:** các lần tách module ở đây chưa được chứng minh PASS bằng CI hoặc local runtime cho đến khi có kết quả kiểm thử tương ứng.

## Lượt tiếp theo — 3 lát cắt của 3 ưu tiên

1. **Worker submit:** `processSubmitDraftCompletion.ts` gom ba đoạn invalidation draft lặp lại khi offline, lỗi mạng và submit thành công. `handleSubmit`, tạo payload, duplicate challenge, retry và lock vẫn ở `ProcessPage.tsx` để tránh thay đổi timing/idempotency. Chưa hoàn thành việc tách toàn bộ submit/duplicate/offline workflow.
2. **Manager approve:** `pendingReportBatchApproval.ts` tách use case phê duyệt nhiều báo cáo, giữ concurrency tối đa 2, tiếp tục xử lý từng lỗi và báo tiến độ. `Reports.tsx` vẫn giữ selection scope, detail navigation, rejection và refresh. Chưa hoàn thành toàn bộ approval/rejection workflow.
3. **Backend submission:** `productionSubmissionProcessRepository.js` nhận hai truy vấn xác định `process_code` authoritative, giữ nguyên thứ tự kết quả và fallback use case. Transaction, lock, duplicate, training snapshot và audit vẫn ở service cũ. Chưa hoàn thành chuyển toàn bộ truy cập SQL sang repository.

**Đánh giá hoàn thành:** ba lát cắt đã commit, **không phải** tuyên bố 3 nhóm refactor lớn đã hoàn tất. Chưa chạy typecheck/build/regression ở commit mới trong môi trường hiện tại. Không merge/deploy.
