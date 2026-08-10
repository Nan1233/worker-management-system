# P0.3 - Transaction + Idempotency hardening (2026-08-10)

## Mục tiêu
- Một report mới chỉ COMMIT khi report chính, NG, thời gian trừ, machine lines và semantic audit đều ghi thành công.
- Retry cùng một lần gửi không tạo report thứ hai.
- Notification là post-commit side effect, không làm rollback dữ liệu sản xuất nếu notification lỗi.

## Thay đổi
1. `productionTempCreateModel.createCompleteReport()` dùng cùng một DB connection cho toàn bộ dữ liệu con và audit.
2. Bắt buộc actor audit hợp lệ trước khi tạo report mới (`REPORT_AUDIT_ACTOR_REQUIRED`).
3. `report_action_logs` CREATE và `activity_logs` CREATE_REPORT được insert trước COMMIT.
4. Worker create API bắt buộc `client_request_id` (`CLIENT_REQUEST_ID_REQUIRED`).
5. UNIQUE DB `(worker_id, client_request_id)` tiếp tục là hàng rào cuối chống retry trùng.
6. Background side effect sau create chỉ còn load reviewer + gửi notification, không ghi lại audit CREATE.
7. Frontend tiếp tục giữ cùng UUID trong lúc retry và reset UUID sau khi submit thành công; force-create sinh UUID mới.

## Verification
- Backend tests: 99/99 PASS.
- Backend source check: PASS.
- Desktop syntax + Excel/DB contract: PASS.
- Excel smoke/build EXE cần `npm install`/`npm run install:all` trên máy dự án vì ZIP không đóng gói node_modules.
