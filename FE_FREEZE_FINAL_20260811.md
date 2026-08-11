# KTC Frontend Freeze Candidate — 2026-08-11

Mục tiêu: hoàn thiện FE để sau vòng này chỉ sửa bug, không tiếp tục redesign.

## Thay đổi chính
- Chuẩn hóa semantic theme aliases trong `ktc-professional.css` cho surface/text/border/input/table/overlay.
- Dark mode dùng chung semantic token thay vì để từng page phụ thuộc nền trắng cố định.
- Chuyển các nền trắng trực tiếp ở page/layout/component CSS sang `var(--ktc-surface)` và các token tương ứng.
- Chuyển các màu nền/table neutral phổ biến sang token (`--ktc-table-head`, `--ktc-table-hover`, `--ktc-divider`, `--ktc-input-readonly`).
- Thay các lớp chrome bán trong suốt bằng `color-mix(... var(--ktc-surface) ...)` để tự thích ứng Light/Dark.
- Đổi `min-height: 100vh` sang `100dvh` tại các vùng ứng dụng để tránh cắt nội dung trên trình duyệt mobile.
- Giữ login không có outer card/frame ở cả Light và Dark.
- Xóa 4 stylesheet legacy không được import để tránh vô tình tái kích hoạt theme cũ: `ktc-unified-theme.css`, `ktc-balanced-blue.css`, `worker-visual-refresh.css`, `process.css`.
- Thêm `npm run check:theme` và đưa vào `frontend npm run check` để chặn regression nền trắng hard-code/100vh.
- Đồng bộ frontend version/cache namespace thành `1.8.13-fe-freeze-20260811`.
- Sửa test cache/version để release bump không tạo false failure.

## Kết quả kiểm tra trong môi trường tạo bản
- Frontend unit tests: **30/30 PASS**.
- Theme contract: **PASS**.
- CSS brace balance: **PASS**.
- TypeScript/build chưa chạy được tại môi trường này vì npm registry nội bộ thiếu `zod-validation-error@4.0.2`; `npm ci` trả 404. Cần chạy `npm run verify` trên máy dự án sau `npm run install:all`.

## Gate trước khi freeze chính thức
1. `npm run install:all`
2. `npm run verify`
3. Visual QA Light + Dark tại 360x800, 390x844, 768x1024, 1366x768.
4. Kiểm tra login, worker form, multi-machine, NG/trừ giờ, history/detail/profile, manager reports/dashboard/modal, admin/system, autocomplete/toast/date/time/select.
5. Nếu tất cả PASS: freeze FE; từ đó chỉ nhận bugfix.
