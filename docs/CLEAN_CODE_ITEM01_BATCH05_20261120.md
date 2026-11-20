# KTC — Hạng mục 1/12 · Clean code đợt 5: Backend phê duyệt và từ chối báo cáo

**Ngày:** 20/11/2026  
**Nhánh:** `refactor/ktc-local-cleanup`  
**Runtime SHA đã nghiệm thu:** `91eb85fa4e3197605c7fe66cb99cb3ef83dbafb8`

## 1. Nội dung đã làm

### Tách backend rejection builders

- Rút 4 hàm thuần (`buildRejectedReportUpdate`, `buildRejectedReportVersion`, `buildRejectedReportActivity`, `buildRejectedReportNotification`) ra khỏi `backend/models/productionTempApprovalModel.js` sang module mới `backend/models/productionTempRejectionBuilders.js`, khoảng **45 dòng**.
- Giữ nguyên SQL `UPDATE production_reports_temp` với điều kiện `status IN ('pending','need_fix')`, và thêm `AND updated_at=?` khi có giá trị version dự kiến. **Không chỉnh schema, SQL transaction, commit/rollback, row locks, manager_processes, hay API**.
- Giữ nguyên object snapshot và `userId` của phiên bản từ chối, metadata audit về công nhân/công đoạn, mã trạng thái và URL thông báo.
- Model chính gọi lại module builder mới bên trong transaction có sẵn. Model vẫn kiểm tra số dòng ảnh hưởng sau mỗi UPDATE và rollback khi thất bại.

### Thay test kiểu đọc chuỗi mã nguồn bằng kiểm thử module thật

- `backend/tests/rejection-builders-batch-refactor.test.js`: chạy module mới bằng `require()` trực tiếp thay vì `vm.runInNewContext` cắt đoạn từ model; mở rộng kiểm tra trường thông báo, tham chiếu snapshot, không mutate đối tượng và tách transaction khỏi builder.
- `backend/tests/review-locking-and-cas-regression.test.js`: sửa lại sử dụng `productionTempApprovalQueries` và builder UPDATE thật; trước đó test đọc các hàm đã không còn nằm trong model chính.
- `backend/tests/review-rejection-row-lock.contract.test.js`: sửa kiểm tra `FOR UPDATE`, giới hạn công đoạn theo `manager_processes`, thứ tự assert visibility/version, `affectedRows`, optimistic CAS, lỗi `APPROVAL_SELECTION_STALE` / `TEMP_REPORT_VERSION_CONFLICT` công khai HTTP 409.
- Hai workflow CI đã được cập nhật trigger cho file model, module và test mới; những bài kiểm tra này hiện chạy tự động.

### Sửa blocker E2E phát hiện trong lượt kiểm chứng

- Lượt kiểm thử trước khi sửa: mobile Admin drawer đôi khi biến mất ngay sau khi bấm mở và đổi trang, khiến nút Đã duyệt hoặc Xuất Excel tồn tại trong DOM nhưng bị ẩn.
- `frontend/src/layouts/AdminLayout.tsx`: đặt trạng thái mở drawer và overflow theo `location.pathname`. Khi đổi route, menu cũ tự đóng ngay từ logic hiển thị, không cần một effect bất đồng bộ có thể đóng nhầm menu mới.
- Không thay role permission hay quyền xem menu. Lượt cuối E2E đã PASS; vẫn cần theo dõi stress/UI trên thiết bị thật.

## 2. Kết quả CI — cùng runtime SHA

| Kiểm thử | GitHub Actions | Kết quả |
|---|---|---|
| Phase 2 consolidated isolated verification | [44692198292](https://github.com/Nan1233/worker-management-system/actions/runs/44692198292) | **6/6 jobs SUCCESS** — Backend source/contract, Frontend lint/typecheck/build, browser smoke, Excel parity, Windows synthetic |
| KTC three-part isolated acceptance | [44692198269](https://github.com/Nan1233/worker-management-system/actions/runs/44692198269) | **3/3 jobs SUCCESS** — TiDB HTTP integration + rejection/row lock tests, Playwright **22 passed, không flaky**, Windows NSIS/Portable staging |

Lượt E2E trước khi sửa menu có **1 flaky mobile** và được giữ trong lịch sử CI. Bản cuối không có flaky trong lượt này. Bộ cài Windows CI là unsigned **staging**, không phải release đã kiểm tra trên PC công ty.

## 3. Phạm vi và việc còn lại

Đợt 5 giải quyết một **nhóm logic Backend ưu tiên**, **không có nghĩa toàn bộ Backend đã được refactor**. Các module lớn còn cần tiếp tục rà soát gồm `productionTempApprovalModel.js` (phần giao dịch, snapshot, copy dòng máy), `productionTempCreateModel.js`, `productionTempSubmissionService.js`, `standardResolutionService.js` và các controller/service khác. Không làm thay đổi cơ chế đang PASS chỉ vì muốn giảm số dòng; mọi phần sẽ cần test tương ứng.

- Hạng mục 1/12: **5/8 đợt đã qua CI**; đợt 6 dự kiến Desktop Excel/đồng bộ, đợt 7 Electron IPC/cấu hình, đợt 8 toàn repo.
- Trước production: còn UAT PC Windows thật, đối chiếu Excel–DB trên staging có dữ liệu được phép, backup/restore, ký số và vận hành/rollback.
- **Không merge main; không deploy Cloudflare; không sửa TiDB production.** Mọi bằng chứng CI trong báo cáo là trên môi trường cô lập.
