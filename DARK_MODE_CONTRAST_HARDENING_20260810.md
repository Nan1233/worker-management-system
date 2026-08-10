# KTC Dark Mode Contrast Hardening — 2026-08-10

## Mục tiêu
Giữ nguyên flow nghiệp vụ và layout hiện tại; sửa dark mode bị khó đọc do nhiều surface/ô nhập/border dùng màu trắng-xám gần nhau hoặc CSS cũ hard-code `#fff`.

## Thay đổi
- Thêm `frontend/src/styles/dark-mode-contrast.css` và import cuối chuỗi global style trong `frontend/src/main.tsx`.
- Chuẩn hóa alias `--ktc-text`, `--ktc-text-muted`, `--ktc-text-faint`, `--ktc-surface-hover` để các lớp polish dùng cùng hệ token.
- Dark palette mới có khoảng cách thị giác rõ giữa page / card / nested surface / input.
- Tăng contrast border, hover, focus, selected row, readonly, disabled, placeholder.
- Đồng bộ date/time/datetime, select option và Chrome autofill ở dark mode.
- Sửa vùng worker có tần suất dùng cao: thời gian, ca làm việc, lựa chọn, multi-machine, NG, trừ giờ, quality summary, action bar, duplicate dialog, network card.
- Sửa worker history/detail, management navigation/header/table, admin tabs/modal/permissions/system controls.
- Badge trạng thái vẫn giữ ý nghĩa success/warning/danger nhưng giảm chói.
- Mobile sticky header/bottom navigation có ranh giới rõ hơn trên nền tối.

## Phạm vi an toàn
Không thay đổi TypeScript nghiệp vụ, API, DB, validation, công thức, Excel hay routing. Chỉ thêm một import CSS và một lớp CSS override có semantic tokens.

## Kiểm tra trong môi trường đóng gói này
- CSS brace balance: OK.
- Import CSS: OK.
- `npm run typecheck/build` chưa thể hoàn tất trong sandbox vì registry nội bộ trả 404 cho dependency `zod-validation-error@4.0.2` khi `npm ci`; đây là lỗi cài dependency của môi trường, không phải lỗi TypeScript phát sinh từ thay đổi (TypeScript chỉ đổi 1 import CSS).

## Lệnh kiểm tra trên máy dự án
```cmd
cd /d C:\VSCode\worker-management-system
npm run install:all
npm run verify
npm run build:exe
```
