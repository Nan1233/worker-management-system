# KTC Full Stabilization — 10/08/2026

Bản này tiếp tục trực tiếp từ P1.2 Cache Hardening và gom các bước P1.3+ còn lại thành một lượt ổn định hóa an toàn trước pilot/demo.

## 1. Database integrity

- Thêm migration `016_integrity_constraints_20260810.sql`.
- Một báo cáo chỉ còn tối đa một dòng cho mỗi loại NG / loại thời gian trừ.
- Migration tự gộp dữ liệu duplicate hiện có trước khi thêm UNIQUE index; không xóa orphan âm thầm.
- Thêm index cho hàng đợi review và truy vấn approved Excel theo kỳ.
- Đồng bộ cùng constraint vào `KTC_RESET_FULL_DATABASE_LATEST_20260810.sql` để DB dựng mới và DB nâng cấp có cùng contract.
- Thêm `npm --prefix backend run db:integrity` với 20 kiểm tra orphan/giá trị bất hợp lệ.
- Backend create/update tự gộp duplicate NG/trừ giờ trước INSERT để tương thích với UNIQUE mới.

## 2. Approval/rejection transaction

- Audit/version vẫn nằm trong transaction.
- Notification worker được chuyển thành post-commit best-effort.
- Lỗi notification không thể rollback một approval/rejection đã commit thành công.
- Stale review, `FOR UPDATE`, UNIQUE `source_temp_id` và period lock từ P0.4/P0.5 vẫn giữ nguyên.

## 3. API / deploy hardening

- CORS origin bị từ chối trả semantic `403 / CORS_ORIGIN_DENIED`.
- JSON malformed trả `400 / INVALID_JSON`.
- Payload quá lớn trả `413 / PAYLOAD_TOO_LARGE` thay vì 500 chung.
- `X-Request-Id` chỉ nhận ký tự an toàn và tối đa 120 ký tự; giá trị lạ được thay bằng UUID server.
- Graceful shutdown có giới hạn 10 giây và đóng kết nối còn treo trước khi kết thúc process.
- Thêm script `audit:prod` cho backend/frontend: `npm audit --omit=dev --audit-level=high` (không dùng `--force`).

## 4. Frontend / PWA / responsive

- Bump service-worker cache namespace lên `1.8.11-full-stabilization-20260810` để xóa cache 1.8.10 cũ sau deploy.
- API vẫn không bao giờ được cache bởi service worker.
- Trang `Quyền` dùng design tokens `--ktc-surface`, `--ktc-ink-*`, `--ktc-border*` nên dark mode không còn card/input trắng lạc tông.
- Giữ bảng quyền cuộn ngang an toàn trên mobile; giảm min-width trên màn hình <=560px.

## 5. Desktop / EXE

- Giữ single-instance lock, sandbox, contextIsolation, nodeIntegration=false.
- Electron build đổi `compression: maximum` để giảm kích thước artifact release.
- Không thay flow 10 file Excel: 1 tổng hợp + 9 công đoạn.

## 6. Kết quả kiểm tra trong workspace

- Backend tests: **113/113 PASS**.
- Backend source check: **PASS** (`118 JavaScript files`).
- Frontend source-contract tests: **22/22 PASS**.
- Desktop source check: **PASS**.
- Excel <-> DB source contract: **PASS**.
- Frontend `tsc/vite build` và Excel smoke không chạy đầy đủ trong sandbox vì ZIP không chứa dependency runtime (`vite/client`, `@types/node`, `exceljs`). Phải chạy `npm run install:all` trên máy repo trước verify/build.

## 7. Thứ tự chạy trên máy thật

```cmd
cd /d C:\VSCode\worker-management-system

npm run install:all
npm --prefix backend run db:migrate
npm --prefix backend run db:integrity

npm run verify
npm run build:exe
```

Nếu `db:integrity` báo FAIL, không được bỏ qua bằng cách xóa dữ liệu tùy tiện. Gửi output kiểm tra trước khi deploy rộng.

Kiểm tra dependency production riêng (không force):

```cmd
npm --prefix frontend run audit:prod
npm --prefix backend run audit:prod
```

## 8. Commit

```cmd
git status
git add frontend backend desktop
git commit -m "Complete KTC production stabilization and database integrity hardening"
git push origin main
```
