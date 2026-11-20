# KTC · Hạng mục 1/12 — Clean code đợt 8/8, tổng rà soát và bàn giao

**Ngày:** 20/11/2026  
**Nhánh:** `refactor/ktc-local-cleanup`  
**Runtime SHA đã kiểm thử:** `91d4037f2617d63d3e94939b2944c0b518f1f0ed`  
**Không triển khai production. Không merge main. Không thao tác TiDB production.**

## 1. Phạm vi kiểm kê repository

Kiểm kê Git tree của nhánh ở SHA runtime nêu trên (không phải kiểm toán thủ công từng file):
- Tổng cộng khoảng **1.682 file** trong tree; trong đó khoảng **1.181 file có đuôi .js/.cjs/.jsx/.ts/.tsx**, **bao gồm test, scripts và mã bundle Android**, nên không diễn giải là 1.181 source files do người viết.
- Các file lớn cần theo dõi trước khi refactor tiếp (kích thước làm tròn):
  - `desktop/electron/monthlyWorkbookLocal.cjs` ~73 KB: Excel layout/schema, dữ liệu máy và trạng thái workbook.
  - `desktop/electron/main.cjs` ~67 KB: IPC, HTTP, sync, file backup/restore, startup.
  - `frontend/src/pages/worker/ProcessPage.tsx` ~50 KB: nhập form, máy dùng chung, NG, offline.
  - `desktop/electron/workerReportTemplateLocal.v2.cjs` ~48 KB; `companyExcelLocal.cjs` ~48 KB.
  - `frontend/src/pages/manager/Reports.tsx` ~43 KB; `WorkerReportEditV2.tsx` ~43 KB.
  - `backend/models/productionTempApprovalModel.js` ~39 KB.
  - `backend/services/standardResolutionService.js` ~35 KB và `productionTempSubmissionService.js` ~35 KB.
- Có nhiều asset `frontend/android/app/src/main/assets/public/assets/*.js` dạng bundle băm tên. Có thể là đầu ra build còn sót, **không xóa khi chưa kiểm tra references trong index/manifest và quy trình đóng gói**.
- `excelExportContractPatch.v5.cjs` và `excelExportContractPatch.v6.cjs` **vẫn được launcher tải có thứ tự**, không kết luận là code thừa chỉ từ tên version.
- `backend/controllers/legacyExcelExportCompatController.js` và các thư mục templates/backup/repair cần đối chiếu route, dữ liệu lịch sử và release artifacts trước khi xóa.

**Kết luận code thừa:** đã đánh dấu ứng viên cần kiểm tra nhưng **không xóa file nào chỉ dựa vào tên/ước lượng**. Không khẳng định đã hoàn thành audit unreachable-code/unused exports toàn repository.

## 2. Lỗ hổng ranh giới IPC phát hiện và đã sửa trong đợt 8

Trước đợt 8, nhiều `ipcMain.handle` trong `desktop/electron/main.cjs` và `launcher.cjs` thực hiện import/đồng bộ Excel, chọn thư mục và cấu hình mà không kiểm tra thống nhất `event.senderFrame` / nguồn gửi.

Thay đổi tại SHA runtime:
- `desktop/electron/securityPolicy.cjs`: thêm `isTrustedIpcSender` và `assertTrustedIpcSender`. Yêu cầu đồng thời (i) WebContents đúng, (ii) **frame chính** đúng object `webContents.mainFrame`, (iii) URL có origin được phép hoặc `file:` trỏ tới index/offline đã tin cậy.
- `desktop/electron/main.cjs`: dùng `protectedDesktopIpc` bảo vệ **11** invoke handler: preview/apply Excel–DB, report import, manual sync, auto sync config, mở/lấy thư mục Excel/log và startup diagnostics. Các sự kiện `ktc-network-online` và `ktc-frontend-painted` cũng từ chối frame không tin cậy.
- `desktop/electron/launcher.cjs`: dùng `protectedLauncherIpc` bảo vệ **4** invoke handler: get/reset/choose export root và ghi Excel thống kê.
- Không thay payload API/preload, `_KTC_SYNC`, logic phân quyền backend, thứ tự Excel patches, cài đặt môi trường hoặc transaction.
- `desktop/tests/electron-ipc-sender-guard.test.cjs` (**3 tests**) mô phỏng frame cùng/khác origin, iframe giả mạo cùng URL, WebContents khác, protocol `data:`/`javascript:`, `file:` ngoài whitelist; hợp đồng yêu cầu **đủ 15/15 IPC invoke handler được bảo vệ**.
- Tăng coverage ở 2 workflow CI và node syntax check.

**Giới hạn bảo mật:** đây là **xác minh nguồn IPC**, không phải xác thực user hay RBAC. Nếu renderer trusted origin bị XSS, frontend có thể gọi những method đã expose. Quyền thao tác dữ liệu vẫn phải chặn tại backend, test từ môi trường thực và xem xét kiểm tra role/token ở các native operations phù hợp. Chưa thực hiện pentest.

## 3. CI cuối trên đúng runtime SHA

| Workflow | Run | Kết quả |
|---|---|---|
| Phase 2 consolidated isolated verification | [44695582147](https://github.com/Nan1233/worker-management-system/actions/runs/44695582147) | **6/6 jobs SUCCESS** — Frontend lint/typecheck/build và test, Backend syntax/contract, Desktop Excel/sync và test IPC, browser public smoke, Windows synthetic/source |
| KTC three-part isolated acceptance (no deployment) | [44695582048](https://github.com/Nan1233/worker-management-system/actions/runs/44695582048) | **3/3 jobs SUCCESS** — TiDB HTTP transaction integration cô lập, E2E desktop/mobile **22/22 PASS không flaky**, Windows unsigned NSIS + Portable staging |

Tất cả đều trên SHA `91d4037f2617d63d3e94939b2944c0b518f1f0ed`. **Đây là hồi quy trọng yếu đã cấu hình, không phải mọi test và mọi luồng trên 1.682 file.** TiDB test chạy cục bộ dùng dữ liệu thử; gói Windows chỉ được build/test trên GitHub-hosted runner, **không phải UAT PC KTC**.

## 4. Tổng kết tám đợt

| Đợt | Phần đã kiểm thử |
|---|---|
| 1 | ApprovedReports presentation, WorkerReportEdit hydration |
| 2 | ProcessPage deduction transitions và reset guard |
| 3 | Worker form validation, chặn state cập nhật lồng nhau, test TT OK |
| 4 | Worker split submit/offline/duplicate suffix, draft invalidation |
| 5 | Backend rejection builders, row locks/CAS tests, mobile admin navigation |
| 6 | Excel→DB normalized values và merge NG/trừ giờ không xóa nhầm DB |
| 7 | Electron startup diagnostics redaction, preload fixed-channel events |
| 8 | Repository tree audit, IPC main-frame/origin guard 15 handler, CI cuối |

**8/8 đợt theo phạm vi phân kỳ đã hoàn tất kiểm thử hồi quy. Điều này KHÔNG đồng nghĩa đã clean hết mọi module hoặc sẵn sàng production.** Hạng mục 1/12 đạt mốc bàn giao phân kỳ, các công việc còn lại được giữ trong backlog dưới đây.

## 5. Backlog sau đợt 8 — ưu tiên theo rủi ro

1. **P1 – Bảo mật Electron:** audit tất cả origin/file navigation, `file:` authority và vòng đời iframe; rà soát 15 handlers theo nhu cầu kiểm tra RBAC/tham số/token; kiểm thử XSS/IPC trên môi trường được phép. Giữ `contextIsolation`, `sandbox`, `nodeIntegration:false`.
2. **P1 – Dữ liệu:** đối soát Excel ↔ TiDB với workbook thực tế trên staging, test edit conflict, `_KTC_SYNC` duplicate/row lineage, backup/restore và rollback. Không dùng dữ liệu production để test tự động.
3. **P1 – Backend:** chia nhỏ tiếp `productionTempApprovalModel.js` và `productionTempSubmissionService.js`, giữ chính xác transaction/row-lock/idempotency và historical standard fail-closed. Test integration thật trước khi thay.
4. **P2 – Excel/Desktop:** tách schema/template ổn định khỏi `monthlyWorkbookLocal.cjs`, `workerReportTemplateLocal.v2.cjs`, `companyExcelLocal.cjs`; test binary/layout parities 9 công đoạn và shared-machine physical output trước khi merge.
5. **P2 – Frontend:** `ProcessPage.tsx` và `Reports.tsx` vẫn lớn; tiếp tục phân rã component state và hooks với test submit/race, lỗi mạng và phê duyệt đồng thời.
6. **P2 – Runtime Windows:** thử Setup/Portable trên PC KTC, đường dẫn NAS/offline, SmartScreen/chữ ký số, auto update/rollback, log redaction khi crash thật.
7. **P3 – Repo hygiene:** so sánh các bundle Android có hash khác nhau với `index.html`/manifest, kiểm tra toàn bộ refs import/routing cho `legacy` controller và patches. **Chỉ xóa khi có bằng chứng unused và rebuild vẫn pass**.
8. **P3 – Test breadth:** mở rộng ma trận 9 công đoạn, ca A/B/C/D, manager scoped roles, Excel roundtrip và stress/performance; hiện tại workflow chủ yếu kiểm thử hợp đồng trọng yếu.

## 6. Release gate

- **Code refactor theo kế hoạch 8/8: PASS CI.**
- **Clean hoàn toàn repository: chưa chứng minh, backlog vẫn còn.**
- **Production release: NO-GO** cho tới khi có UAT PC Windows thật, dữ liệu staging/backup-restore, bảo mật và kiểm thử nghiệp vụ đủ quy tắc.
- Không merge `main`; không deploy Cloudflare; không sửa TiDB production. Sau giai đoạn này, chuyển sang **hạng mục 2/12 — Kiểm thử nghiệp vụ toàn diện**, đồng thời quản lý backlog clean/security ở trên.
