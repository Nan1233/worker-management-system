# KTC — Kiểm thử theo trang và luồng (nhánh test)

Nguồn route: `frontend/src/routes/AppRouter.tsx`. Đây là bản đồ **phạm vi** để thực hiện kiểm thử tuần tự, **không phải chứng nhận các trang đã PASS**.

## Nguyên tắc

- Chỉ chạy trên bản sao local của nhánh `test`, bằng mock hoặc DB test hoàn toàn độc lập.
- Không sử dụng URL production, biến môi trường TiDB production, hay lệnh `npm test` tổng thể khi chưa rà soát từng test.
- Không bật Actions/CI, không deploy, không merge `main`.
- Mỗi trang cần cả kiểm thử hàm thuần, phân quyền/API và tương tác UI. Manifest hiện mới cho phép một nhóm **unit test cô lập**; chưa phải E2E.
- Một route chung (ví dụ `/worker/process/:process`) chứa nhiều công đoạn: cần thêm case riêng cho GC/MAI/DO/K1/K2/CAN/EP/XLBV/SX3 trước khi công nhận đủ phạm vi.

## Nhóm trang và flow

| ID | Trang/route chính | Flow cần xác minh | Trạng thái test cô lập |
| --- | --- | --- | --- |
| AUTH | `/login`, route guard | Đăng nhập → xác thực → đúng vai trò → đăng xuất, token lỗi | Chưa bổ sung |
| W01 | `/worker` → `/worker/process/select` → `/worker/process/:process` | Chọn công đoạn → nhập ca, ngày, máy/SP → NG/trừ giờ → gửi và chống trùng | Có unit test nền tảng; chưa test UI/API |
| W02 | `/worker/history` → `/worker/history/:id` → `/worker/history/:id/edit` | Lọc lịch sử → xem → sửa trong giới hạn quyền/trạng thái | Chưa bổ sung |
| W03 | `/worker/statistics`, `/worker/profile`, `/worker/notifications` | Chỉ dữ liệu người dùng được phép xem | Chưa bổ sung |
| GC | `/worker/process/:process` (GC), `/manager/report/:id` | Máy dùng chung, giờ máy thực tế tính một lần, giờ trừ & tín chỉ công nhân riêng | Có unit test nền tảng; chưa test tích hợp |
| CVK | `/worker/process/non-product` (redirect), `/worker/process/:process` | CVK: tìm báo cáo trùng ở bảng tạm trước báo cáo đã duyệt | Có mock model test |
| L01 | `/lead/reports`, `/lead/reports/review`, `/lead/approved` | Lọc chờ duyệt → xem chi tiết → duyệt/từ chối theo công đoạn | Chưa bổ sung |
| M01 | `/manager/reports`, `/manager/report/review`, `/manager/approved` | Duyệt hàng loạt → conflict phiên bản → cập nhật trạng thái | Chưa bổ sung |
| M02 | `/manager/report/:id`, `/manager/report/:id/edit`, `/manager/export` | Xem/sửa đã duyệt → snapshot và phân quyền → xuất Excel | Chưa bổ sung |
| M03 | `/manager/workers`, `/manager/statistics`, `/manager/processes` | Danh sách nhân sự, thống kê và công đoạn đúng scope | Chưa bổ sung |
| A01 | `/admin/workers`, `/admin/master/:resource`, `/admin/permissions` | Quản lý người dùng, master data, quyền | Chưa bổ sung |
| A02 | `/admin/master-control/*` | Security, database, audit, backup, deployment | Chưa bổ sung |
| X01 | Desktop Electron | Xuất sổ tháng → đồng bộ metadata → không nhân đôi sản lượng → giữ snapshot | Có kiểm thử primitive; chưa có E2E workbook |
| SYS | `/system`, `/notifications` qua các role | Thông báo, audit & quyền truy cập | Chưa bổ sung |

## Chạy từng flow (tại thư mục backend)

```bash
node scripts/runFlowTests.cjs --list
node scripts/runFlowTests.cjs --flow worker-entry
node scripts/runFlowTests.cjs --flow gc-machine
node scripts/runFlowTests.cjs --flow cvk-duplicate
node scripts/runFlowTests.cjs --flow desktop-excel
node scripts/runFlowTests.cjs --all-safe
```

`--all-safe` chỉ chạy các **test được khai báo rõ trong `tests/flowSuiteManifest.cjs`**, khử trùng file test giữa các nhóm. Flow chưa có test trả mã lỗi và **không tự nhận PASS**.

## Tiêu chí hoàn tất một trang

1. **Unit**: chuẩn hóa và tính toán với trường hợp biên.
2. **API/permission**: dữ liệu đúng scope, từ chối truy cập trái quyền, xử lý version conflict, idempotency.
3. **UI**: render, validation, trạng thái loading/error, điều hướng.
4. **Regression**: so sánh snapshot Excel, sản lượng, NG, giờ trừ, định mức trước/sau refactor.
5. **E2E staging**: chỉ khi có DB test độc lập và tài khoản test; không dùng production.

**Lưu ý:** Manifest là danh sách allowlist ban đầu. Trước khi thêm file test, phải đọc để xác nhận file đó không gọi API thật hoặc truy cập TiDB.
