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

## Lượt xử lý nhóm 4–9: thay đổi đã ghi vào repository

| Nhóm | Lát cắt đã thực hiện | Phạm vi còn lại |
|---|---|---|
| 4. Approval backend | `productionApprovalReadRepository.js` giữ SQL timing/error log; `modules/production/domain/machineDefectLineage.js` giữ phép gắn NG theo machine_line_id và lỗi fail-closed | Các transaction/snapshot copy/notify còn ở `productionTempApprovalModel.js` |
| 5. Feature boundaries | Domain production tách riêng, approval model nhập hàm domain, repository chuyên dụng phục vụ approval | Các feature còn dùng paths legacy; chưa chuyển toàn bộ sang feature-first |
| 6. Excel | `monthlyWorkbookSchemas.cjs` sở hữu `PROCESS_SHEETS` và `PROCESS_TEMPLATE_SCHEMAS`; `monthlyWorkbookLocal.cjs` import và giữ nguyên public exports | Render/metric/writer còn nằm trong module lớn; chưa tách toàn bộ |
| 7. Electron | `ipc/folderIpc.cjs` đăng ký ba folder IPC actions qua `protectedDesktopIpc` được truyền từ bootstrap | Phần lớn IPC/sync/bootstrap còn trong `main.cjs` |
| 8. Hợp đồng/test | Chỉnh 4 test hiện có để đọc module mới, vẫn giữ assertion nghiệp vụ, cập nhật tài liệu ranh giới | Cần xem lại các source-regex test khác qua full test run |
| 9. Regression | Đối chiếu 13/13 tiêu chí cấu trúc với nội dung GitHub ở HEAD | **Chưa chạy** runtime tests, typecheck/lint/build, desktop Excel smoke; không tuyên bố regression PASS |

### Những điểm xác nhận bằng kiểm tra cấu trúc

- Approval giữ cách begin/commit transaction, domain lineage không import DB, SQL diagnostic giữ mã log cũ.
- Excel sheet mapping còn đủ 10 mã công đoạn, writer giữ `_private` và public exports.
- Electron vẫn bọc `protectedDesktopIpc` cho ba handler được tách, `isTrustedIpcSender` ở main giữ nguyên.
- Các test NG còn assertion orphan lineage, invalid IDs, per-machine ordering; các test Excel giữ cột/schema.
- Không kết luận 6 hạng mục **đã hoàn tất toàn bộ**; các bước này là refactor tăng dần và chưa được nghiệm thu chạy thực tế.

### Bắt buộc thực hiện trước khi merge

```sh
# repo root
node --test backend/tests/approval-machine-defect-grouping-refactor.test.js backend/tests/temp-machine-defect-lineage-validation-regression.test.js backend/tests/approval-temp-machine-line-read-refactor.test.js backend/tests/excel-process-template-schema.test.js backend/tests/source-integrity.test.js
# frontend
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
# backend
cd ../backend && npm run check && npm test
# desktop: chạy các smokeExcel/validateExcelFolder scripts có sẵn trên fixture an toàn,
# đối chiếu bytes/worksheet/sync metadata với baseline; không động vào dữ liệu production.
```

Các lỗi do source-extraction khác phải được xử lý trước merge. Test chỉ được đánh dấu PASS khi có log chạy tại đúng commit.

## Lượt cải tiến tiếp — manager rejection và ổn định test cấu trúc

- `frontend/src/pages/manager/pendingReportBatchRejection.ts`: chuyển workflow từ chối từng báo cáo ra khỏi page, vẫn tuần tự, gom danh sách ID lỗi và thông báo lỗi từng báo cáo. `Reports.tsx` chỉ thực hiện xác nhận từ người dùng, giữ selection/filter/detail scope và refresh.
- `backend/services/productionTempSubmissionService.js`: dùng `findSubmissionProcessCode(processId, executor)` ở bước kiểm tra tổng giờ; giữ executor/transaction do caller truyền, fallback process code và feature toggle.
- `frontend/src/pages/worker/processSubmitDraftCompletion.ts`: loại bỏ React type import không dùng.
- `frontend/tests/manager-pending-detail-race.contract.test.cjs`: vẫn kiểm tra close invalidates detail request, nhưng kiểm tra button close ở `PendingReportDetail.tsx` là nơi UI được tách tới.
- `frontend/tests/phase5-approval-outcome-refresh.test.cjs`: cập nhật end marker `const detailKpi =` đã không còn tồn tại thành comment thực tế trước phần report code; giữ nguyên các assertion success-before-refresh.

**Kiểm tra đã làm:** đối chiếu nội dung module và 9/9 điều kiện cấu trúc bằng GitHub fetch; **không** phải node test/typecheck/build. Thiếu checkout và môi trường CI runtime trong lượt này nên chưa ghi PASS nghiệm thu. Chưa merge/deploy.

## Lượt nâng chất lượng tiếp theo (20/11/2026) — domain thuần và kiểm thử hợp đồng

### Thay đổi đã commit

- `backend/modules/production/domain/submissionIdempotency.js` giữ duy nhất hình dạng response retry đơn và grouped (Mài/GC), không phụ thuộc SQL.
- `backend/modules/production/domain/nonProductSnapshot.js` giữ phân loại non-product work, snapshot zero-standard và lỗi public 422, độc lập với approval model và DB.
- `backend/services/productionSubmissionRollback.js` chịu trách nhiệm log và gắn rollback error vào SQL error gốc; cho phép tiêm rollback operation/logger khi test, vẫn dùng rollback cũ ở runtime.
- `desktop/electron/excelDownloadMetadata.cjs` chịu trách nhiệm đọc Content-Disposition và chuẩn hóa process fields; main chỉ tải/lưu file Excel.
- `frontend/src/pages/worker/useProcessOnlineStatus.ts` tách lắng nghe online/offline khỏi page, **không đổi** `navigator.onLine` guard trong xử lý submit.
- Chuyển 9 test machine-copy sang marker ổn định sau khi tách domain, chuyển 2 test non-product snapshot sang import domain thật. Không đổi assertions bảo toàn dòng máy, thông báo lỗi, snapshot.

### Kiểm chứng hiện có

- **14/14 tình huống độc lập** được chạy bằng runtime JavaScript cô lập từ nội dung module GitHub: retry đơn/nhóm, ưu tiên group, snapshot 422, phân loại CVK, tên file UTF-8/fallback, normalize ID, rollback failure diagnostics. Đây là smoke theo module, không phải backend `npm test`.
- **12/12 tệp JS/CJS** được parser kiểm tra cú pháp bằng JavaScript runtime cô lập; không thay cho Node environment hoặc TypeScript compiler.
- Đã bổ sung test `backend/tests/production-module-boundaries.test.js` ngăn production domain import DB/HTTP/UI và bảo vệ transaction entrypoints.
- Đã thêm test `backend/tests/production-submission-rollback.test.js`, `backend/tests/production-submission-idempotency.test.js`, `desktop/tests/excel-download-metadata.test.cjs`. **Chưa chạy chính thức** bằng Node trên checkout repo.

### Cổng còn bắt buộc trước merge

```sh
# Trong root, sau khi checkout HEAD refactor
node --test backend/tests/production-module-boundaries.test.js backend/tests/production-submission-rollback.test.js backend/tests/production-submission-idempotency.test.js backend/tests/approval-nonproduct-snapshot-refactor.test.js backend/tests/approval-nonproduct-snapshot-error-refactor.test.js
node --test desktop/tests/excel-download-metadata.test.cjs

cd backend && npm run check && npm test
cd ../frontend && npm run typecheck && npm run lint && npm test && npm run build
# Trong desktop, chạy smoke Compact/Excel và Electron IPC guard trên fixtures không-production
```

Không merge, không deploy, không động DB production; mọi kết luận “clean tối đa” phải dựa thêm trên kết quả đầy đủ và review phụ thuộc thực tế.
