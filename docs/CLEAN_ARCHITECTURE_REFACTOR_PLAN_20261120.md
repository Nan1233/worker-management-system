# KTC — Kế hoạch Clean Architecture tăng dần theo nghiệp vụ

**Ngày:** 20/11/2026  
**Nhánh duy nhất để thay đổi:** `refactor/ktc-local-cleanup`  
**Mục tiêu:** code có trách nhiệm rõ ràng, dễ đọc, dễ sửa và dễ mở rộng **mà không thay đổi hành vi hiện tại**. Không lấy việc viết thêm test làm mục tiêu.

## 1. Đọc hiện trạng trên repository

Hệ thống có ba runtime:
- **Frontend (React/TypeScript):** form công nhân, quản lý duyệt/báo cáo, admin. Các module trong `frontend/src/pages/worker/` đã có nhiều helper/hooks tốt nhưng `ProcessPage.tsx` vẫn ~1.357 dòng và giữ nhiều state, nghiệp vụ và JSX cùng lúc. `Reports.tsx` trước lượt này ~518 dòng trộn tải dữ liệu, chọn báo cáo, duyệt/từ chối và bảng/chi tiết/dialog.
- **Backend (Node/Express + SQL):** router → controllers → services/models; có logic phạm vi `manager_processes`, version snapshot, transaction, idempotency và chuẩn hoá. `productionTempApprovalModel.js` đã tách query/rejection/snapshot builder nhưng vẫn ~848 dòng; `productionTempSubmissionService.js` ~36 KB, `standardResolutionService.js` ~36 KB. Một chiều phụ thuộc chưa sạch: `productionTempReportPayloadService.js` nhập `normalizeOperationType` và `normalizeOperationMode` từ `controllers/productionTempControllerUtils` — service đang phụ thuộc controller.
- **Desktop (Electron + ExcelJS):** `main.cjs` ~70 KB trộn khởi động/IPC/sync, `monthlyWorkbookLocal.cjs` ~75 KB giữ nhiều trách nhiệm Excel; `excelDbSync.cjs` đã tách normalizer. Các file này cần cô lập logic workbook/file/DB khỏi IPC, nhưng phải giữ `_KTC_SYNC`, đường dẫn và thứ tự patches khi đóng gói.

Cần phân biệt **file lớn** với **code thừa**: không xóa chỉ vì tên `legacy` hoặc file có version. Với Android web assets, chỉ dọn sau khi xác minh manifest và các bundles được dùng.

## 2. Mô hình đích: feature-first với một chiều phụ thuộc

### Frontend — từng tính năng tự quản lý UI, workflow và data access

```text
src/features/<feature>/
  domain/          quy tắc, kiểu dữ liệu và hàm tính thuần
  application/     hooks/use-cases: form state, submit, approve, retry
  infrastructure/  API adapters, offline storage/cache
  components/      UI thuần nhận props/callback
  pages/           route/container lắp ghép các lớp
```

**Hướng phụ thuộc:** components → props/types; pages → application + components; application → domain + interface repository; infrastructure → API/storage. **Domain không import UI, route hay Axios.** Giữ import đường dẫn cũ thông qua facade/re-export khi cần; không đổi toàn bộ cây thư mục trong một commit.

**Phân rã thực tế:**
- `Reports.tsx` chịu trách nhiệm state và use case duyệt. Các view `PendingReportTable`, `PendingReportDetail`, `PendingRejectDialog` nằm riêng; `pendingReportPresentation.ts` giữ định dạng cho riêng feature. **Đã tách** tại commit `15e13de734e64b455f3b7669fe3cee016c08d289`.
- Bước kế tiếp: `usePendingReportList` quản lý filter/pagination, abort/cancel; `usePendingReviewActions` quản lý approve/reject/selection scope. Chỉ chuyển sau khi xác nhận không làm mất bảo vệ race/optimistic lock.
- `ProcessPage.tsx`: tiếp tục tách **form coordinator** khỏi use case `submit`, `duplicate retry/offline` và `draft`; các helper validation, deduction, quality, machine lines đang có nên tái sử dụng, không viết lại.
- `productionService.ts`: tách nhóm endpoint theo pending/approved, machine events, Excel; giữ export facade cũ để không phải đổi mọi importer.

### Backend — use-case trước, tầng lưu trữ sau

```text
backend/modules/production/
  domain/          chuẩn hóa dữ liệu, calculation, business invariants
  application/     submit, review, approve/reject, edit/restore
  infrastructure/  repositories SQL, transactions, snapshot persistence
  http/            controllers/route handlers (input/output only)
```

- **HTTP controller:** parsing request, auth, chuyển lỗi API. Không đặt logic kinh doanh ở đây.
- **Application service:** trình tự nghiệp vụ, quyền theo công đoạn, concurrency, transaction boundaries và notifications sau commit.
- **Repository:** SQL, load/save, row locks, optimistic CAS. Không import Express.
- **Domain:** hàm tính thuần cho báo cáo, máy, định mức và chi tiết NG/trừ giờ; không import controller/database.
- Chuyển `productionTempControllerUtils` normalizers sang domain và giữ re-export ở đường dẫn cũ để tương thích.
- Không tự gộp transaction của `productionTempApprovalModel.js` hoặc sửa cách copy dòng máy/ảnh chụp lịch sử trong một lượt sắp xếp thư mục.

### Desktop — bootstrap mỏng, IPC mỏng, Excel và sync độc lập

```text
desktop/electron/
  bootstrap/   startup, cấu hình, lifecycle
  ipc/         whitelist handlers, trusted sender, adapters
  excel/
    domain/    chuẩn sheet, metric, mapping công đoạn
    workbooks/ tạo/đọc workbook
    sync/      _KTC_SYNC, diff/preview/apply
  storage/     paths, file safety, atomic write, backup
```

Các module mới không gọi trực tiếp `ipcMain` trừ tầng `ipc/`. `main.cjs`/launcher chỉ nối dependency. Giữ public preload methods, profile TEST/production, templates, tên sheet và vị trí cột.

## 3. Thứ tự ưu tiên refactor (không thay nghiệp vụ)

1. **P1 — Manager Pending/Approved:** tách view & controller trước, sau đó hook để loại các khối state/side effects phình to. Các CSS và component public giữ nguyên.
2. **P1 — Worker ProcessPage:** tách domain/use case submit, draft, duplicate & machine-lines khỏi page coordinator, không phá các hook đang ổn định.
3. **P1 — Backend submission/review:** sửa dependency ngược service→controller; chia chức năng đọc/ghi/copy/snapshot theo use case, giữ transaction ở application boundary.
4. **P2 — Desktop Excel:** xác định sheet/value mapping và writer, chia module Excel có interface rõ ràng; không sửa trực tiếp mẫu thật trong lúc tổ chức lại.
5. **P2 — Electron IPC:** phân nhóm file/native actions thành handlers inject dependencies; tuyệt đối giữ trusted-frame/auth checks và API preload.
6. **P3 — Repo cleanup:** tìm import/reference thực, xóa code thừa có bằng chứng; tránh thay đổi hàng loạt và đổi tên tùy tiện.

## 4. Những quy tắc bất biến phải giữ

- Quy tắc **9 công đoạn**, ca A/B/C/D, quyền admin/manager/lead/worker; `manager_processes`, `worker_processes`.
- Lưu **historical standard/training snapshot theo ngày**, fail-closed khi không có phiên bản hợp lệ; giữ kết quả đã duyệt.
- Trùng dữ liệu: `client_request_id`, logical duplicate, offline queue, xử lý mạng lỗi không gửi lặp và optimistic `expected_updated_at`.
- GC máy auto/chia sẻ: sản lượng/thời gian vật lý của **một máy chỉ tính một lần**, credit công nhân tách riêng.
- **Excel:** công thức, định dạng/sheet/row, `_KTC_SYNC`, ngày sản xuất, order, tính năng đồng bộ và rollback.
- **Electron:** không thay cấu hình sandbox, context isolation, nguồn IPC đáng tin cậy và cách lưu/chuyển token.

## 5. Tiêu chí hoàn thành mỗi bước Clean Code

- Ranh giới và trách nhiệm module rõ hơn trước; không chỉ đổi tên hay chuyển dòng vô nghĩa.
- Không thay endpoint, shape request/response, UI behavior, persisted data, transaction, Excel output.
- Không tạo thêm ma trận test nghiệp vụ. **Chỉ chạy lint/typecheck/build và regression đã có** để phát hiện sai khác ngoài ý muốn.
- Nếu thấy lỗi nghiệp vụ trong lúc refactor, **ghi lại riêng** thay vì âm thầm sửa hành vi trong commit cấu trúc.
- Mỗi commit nhỏ, dễ rollback, trên nhánh refactor; **không merge, không deploy, không thao tác DB production**.

**Đây là kiến trúc mục tiêu và kế hoạch chuyển đổi tăng dần, chưa phải khẳng định repository đã đạt Clean Architecture đầy đủ.**
