# KTC Production Hardening — 2026-08-10

Mục tiêu: xử lý các điểm yếu còn lại về offline reliability, restore rehearsal, external monitoring readiness, load/concurrency readiness và Excel folder validation. Không thêm feature nghiệp vụ mới.

## Thay đổi chính

1. Offline report queue
   - Có trạng thái `queued | retrying | blocked`.
   - Retry mạng/408/425/429/5xx bằng exponential backoff tối đa 15 phút.
   - 4xx nghiệp vụ/auth bị `blocked`, không spam API mỗi phút.
   - Luôn giữ nguyên `client_request_id` để backend idempotency chống report trùng.
   - UI cảnh báo khi có báo cáo offline cần kiểm tra thủ công; dữ liệu vẫn giữ trên thiết bị.

2. External monitoring readiness
   - `GET /api/health/live`: process đang sống, không phụ thuộc DB.
   - `GET /api/health/ready`: kiểm DB và trả latency; 503 khi chưa sẵn sàng.
   - `/api/health` cũ vẫn giữ tương thích.

3. Restore rehearsal an toàn
   - `npm run restore:rehearsal -- --file <backup>`.
   - Bắt buộc dùng biến `KTC_RESTORE_DB_*` cho DB staging/test.
   - Tự chặn nếu DB đích trùng production.
   - Sau restore tự chạy `db:integrity` + `validate:real-data`.

4. Read-only load readiness
   - `npm run load:readiness`.
   - Test concurrent DB `SELECT 1` và tùy chọn `/api/health/ready`.
   - Không tạo/sửa/xóa production report.
   - Điều chỉnh bằng `KTC_LOAD_REQUESTS`, `KTC_LOAD_CONCURRENCY`, `KTC_LOAD_API_BASE`.

5. Excel folder validator sâu hơn
   - Kiểm đủ 10 file.
   - 9 file công đoạn chỉ có đúng sheet hiển thị.
   - `_KTC_SYNC` phải `veryHidden`.
   - Kiểm freeze `xSplit=4,ySplit=5,topLeftCell=E6`.
   - Kiểm cột công thức quan trọng.
   - Không được lặp `Ngày báo cáo` trên từng dòng.
   - Kiểm hàng phân cách ngày, merge A:D, vùng E.. cuối phải trống.
   - Kiểm STT reset theo từng ngày và `Thời gian nhập` có dữ liệu.

## Kết quả kiểm tra trong workspace

- Backend tests: 120/120 PASS
- Frontend tests: 28/28 PASS
- Backend source check: PASS (119 JS files)
- Desktop check: PASS
- Excel <-> DB source contract: PASS
- Full frontend typecheck chưa chạy được trong sandbox do source ZIP không chứa `vite/client` và `@types/node`; chạy `npm run install:all` trên máy thật trước `npm run verify`.

## Restore rehearsal

Cấu hình DB staging riêng, ví dụ:

```cmd
set KTC_RESTORE_DB_HOST=...
set KTC_RESTORE_DB_PORT=4000
set KTC_RESTORE_DB_USER=...
set KTC_RESTORE_DB_PASSWORD=...
set KTC_RESTORE_DB_NAME=ktc_restore_test
set KTC_RESTORE_DB_SSL=true
npm run restore:rehearsal -- --file "C:\path\backup.jsonl.gz"
```

Không trỏ các biến `KTC_RESTORE_DB_*` về DB production.

## Load readiness

```cmd
set KTC_LOAD_REQUESTS=500
set KTC_LOAD_CONCURRENCY=25
set KTC_LOAD_API_BASE=https://worker-management-system-2-5jqv.onrender.com
npm run load:readiness
```

Đây là load test read-only. Write/concurrent submit test phải chạy trên staging với tài khoản/dữ liệu test riêng, không bắn vào production.
