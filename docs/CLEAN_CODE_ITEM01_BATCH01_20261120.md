# KTC — Hạng mục 1/12: Clean code toàn dự án · Đợt 1

Ngày thực hiện: **20/11/2026** · Nhánh: `refactor/ktc-local-cleanup`.

## Phạm vi đã thực hiện và kiểm chứng

**Runtime commit:** `c7ce0a8a35f1fb062de8ae3b289e1647849863b0`.

**Kiểm thử:**
- [KTC three-part isolated acceptance, run 44680476547](https://github.com/Nan1233/worker-management-system/actions/runs/44680476547): **3/3 SUCCESS**, Chromium desktop/mobile **22 passed, 0 flaky, 0 failed**; backend HTTP trên TiDB thử nghiệm, Windows NSIS/Portable staging.
- [Phase 2 consolidated isolated verification, run 44680506032](https://github.com/Nan1233/worker-management-system/actions/runs/44680506032): **6/6 SUCCESS** trên commit `7eddfb3253409d271f38aa82bd8b41b5404c7455`, chỉ khác runtime commit ở một file test contract frontend.
- Run cũ trên source trước khi sửa sự kiện input (`44680091994`) từng FAIL vì 1 bài mobile flaky. **Không sử dụng kết quả cũ đó để nghiệm thu bản mới.**

### Frontend: màn hình báo cáo đã duyệt

- Chuyển các hàm thuần `reportCodes`, `num`, `text`, `fmt`, `pct`, `dateText`, `dateValue`, `rangeFor`, `kpi`, `metricStyle`, `parseMachineDefects` từ `src/pages/manager/ApprovedReports.tsx` sang `src/pages/manager/approvedReportsPresentation.ts` (khoảng 6 KB).
- Thêm `frontend/tests/approved-reports-presentation.test.cjs` kiểm chứng hiển thị mã máy/sản phẩm, ưu tiên KPI đã lưu so với fallback, thời gian tổng/net, tỷ lệ, phạm vi ngày, định dạng và dữ liệu lỗi NG lịch sử.
- **Không sửa công thức KPI** hoặc thay đổi thứ tự ưu tiên các trường đã lưu trong đợt refactor này. Parser lịch sử khi `defects` là object vẫn ưu tiên `defects_json` theo mã hiện tại; đây là hành vi đã khóa bằng bài test, không mặc nhiên coi là chuẩn nghiệp vụ cho mọi dữ liệu.

### Frontend: khởi tạo biểu mẫu và sửa TT OK

- `WorkerReportEditV2.tsx`: bỏ `setReport(data)` trung gian, chỉ khởi tạo report sau khi tổng hợp `__edit_machine_lines`, tránh nguy cơ hydrate hai lần.
- Chỉ tải master data sau khi biết `process_id`, không ngầm suy diễn công đoạn `GC` trước khi nhận báo cáo.
- `useProcessMasterData.ts`: thêm `masterDetailsReady` độc lập với readiness của máy/sản phẩm để form sửa đợi đủ danh mục NG và trừ giờ.
- Bắt `event.currentTarget.value` **đồng bộ trước khi gọi state updater** đối với TT OK và các ô nhập liên quan; không đọc event DOM bên trong updater có thể được React thực thi muộn.
- Thêm `frontend/tests/approved-edit-hydration-gate.contract.test.cjs` và tăng kiểm tra trên `frontend/tests/e2e/role-navigation.spec.ts` để bảo đảm TT OK vẫn đúng trước/sau khi rời ô và PUT lưu đúng giá trị.

### An toàn và tương thích

- Không sửa schema/migration, không thay đổi tên endpoint, cấu trúc response, định mức lịch sử, bảng production hay luồng duyệt báo cáo.
- Không merge `main`, không deploy Cloudflare, không chỉnh dữ liệu TiDB production. CI chỉ dùng DB cô lập và tệp Excel tổng hợp synthetic.
- Windows staging EXE chưa có chữ ký release và chưa chạy UAT trên PC công ty thật.

## Phạm vi còn lại của hạng mục 1/12

Đây mới là **đợt 1; clean code toàn bộ repo chưa hoàn tất**. Các module lớn ưu tiên tiếp theo được xác định từ danh sách file trên nhánh:

| Thứ tự | Module | Kích thước gần đúng | Hướng tách an toàn |
|---|---|---:|---|
| 1 | `frontend/src/pages/worker/ProcessPage.tsx` | 54 KB | Tách UI handlers, quy tắc form/submit và hooks có test |
| 2 | `backend/models/productionTempApprovalModel.js` | 41 KB | Phân chia phần lựa chọn, kiểm tra version, giao dịch, giữ nguyên row locks |
| 3 | `desktop/electron/monthlyWorkbookLocal.cjs` | 73 KB | Tách schema/định dạng file và logic render, khóa workbook parity |
| 4 | `desktop/electron/main.cjs` | 67 KB | Phân tách IPC/khởi động và tránh chuyển đường dẫn/secret tùy tiện |
| 5 | `frontend/src/pages/manager/Reports.tsx` | 43 KB | Tách phần lọc/bulk actions/dialog và UI, bảo vệ concurrency |
| 6 | `backend/services/standardResolutionService.js` | 35 KB | Tách helper thuần và module SQL với test fail-closed theo lịch sử |

**Cổng cho mỗi đợt:** chỉ commit trên nhánh test → lint/typecheck/build → unit/contract/source tests → E2E với TiDB cô lập không flaky → Windows/Excel regression nếu file ảnh hưởng xuất → mới chuyển đợt kế. Các file liên quan tính toán và giao dịch cần test snapshot hoặc đối chiếu chính xác trước khi điều chỉnh.

## Trạng thái

- **Item 1/12 — Clean code:** **Đang thực hiện; đợt 1 PASS CI**.
- **Production release:** **NO-GO**, cần nghiệm thu Desktop thật, ký EXE, Excel↔DB trên dữ liệu TEST được phép và backup/restore trên staging. Chi tiết xem [checklist Phase 5](PHASE5_CLEANUP_AND_RELEASE_GATE_20261120.md).
