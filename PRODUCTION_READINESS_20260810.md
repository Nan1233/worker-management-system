# KTC Production Readiness — 2026-08-10

Bản này không thêm nghiệp vụ mới. Mục tiêu là tăng độ tin cậy vận hành ở 6 nhóm: real-data E2E, Excel validation, offline reliability, monitoring, backup/restore drill và UI polish.

## 1. Real-data E2E
- `npm run validate:real-data`
- Đọc tối đa 1000 approved reports gần nhất (đổi bằng `KTC_E2E_SAMPLE_LIMIT`).
- Kiểm tra NG detail, deduction detail, 12h, ngày tương lai, actual output/KQD, standard, entry date và calculation engine.
- Không ghi/sửa dữ liệu.

## 2. Excel validation
- Smoke fixture: `npm --prefix desktop run smoke:excel`.
- Kiểm file thật: `npm --prefix desktop run validate:excel-folder -- "C:\\...\\2026\\08" 2026-08`.
- Bắt thiếu 10 file, sai sheet, thiếu cột cốt lõi, freeze sai và file tổng hợp thiếu sheet.

## 3. Offline reliability
- Chỉ queue khi mạng KTC đã được xác nhận và request submit bị gián đoạn mạng sau đó.
- Queue gắn user_id + worker_id + worker_code, TTL 24 giờ, tối đa 25 report.
- Giữ nguyên `client_request_id`; khi online lại tự retry nên backend idempotency chặn duplicate.
- Lỗi validation/auth không bị xóa khỏi queue để tránh mất dữ liệu.

## 4. Monitoring
- Endpoint bảo vệ: `GET /api/system/observability` (`SYSTEM_HEALTH_VIEW`).
- Trung tâm hệ thống có tab Giám sát: DB latency, requests, 4xx/5xx, slow requests, RAM/heap, uptime, recent 5xx request IDs.
- Không lưu query string trong recent server errors.

## 5. Backup/restore
- `npm run backup:db`
- Sau khi tạo file, chạy `npm run backup:drill -- <file>`.
- Drill xác nhận SHA-256, decrypt/gunzip, schema, row counts và end marker.
- Restore thật vẫn yêu cầu `--confirm KTC_RESTORE`; không tự restore production.

## 6. UI polish
- Thêm `release-polish.css`: control height, radius/shadow, empty states, mobile font-size 16px, tab overflow và touch consistency.
- Không đổi flow/form/business rules.

## Validation tại workspace
- Backend tests: 116/116 PASS.
- Frontend source tests: 26/26 PASS trước cache-version bump; chạy lại sau packaging.
- Backend source check: PASS.
- Desktop check + Excel/DB contract: PASS.
- Full TypeScript build cần `npm run install:all` vì source ZIP không chứa `vite/client` / `@types/node`.
