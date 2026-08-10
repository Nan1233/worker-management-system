# P1.1 Auth / Session Hardening — 2026-08-10

## Mục tiêu
Khóa lỗi đổi tài khoản và stale session trên Web/PWA, đặc biệt khi nhiều tab cùng mở một origin dùng chung HttpOnly refresh cookie.

## Thay đổi
- Thêm `clearCurrentTabAuthSession()` để xóa access token/user/cache chỉ của tab cũ, không xóa refresh cookie/session hint của tài khoản mới.
- Khi `ktcAuthEpoch` thay đổi từ tab khác, tab cũ hủy refresh đang chạy, xóa access state ngay và chuyển về login.
- Thêm marker passive cross-tab redirect để tab cũ không bump auth epoch lần nữa và vô tình đăng xuất ngược tab vừa login.
- Refresh response được ràng buộc với user hiện tại: nếu response thuộc user id khác, response bị hủy và tab stale bị logout thay vì đổi danh tính âm thầm.
- Giữ nguyên login isolation hiện có: request login độc lập với interceptor, revoke refresh session cũ và chỉ nhận response nếu auth epoch vẫn đúng.

## Regression tests
- Frontend auth hardening: 4/4 PASS.
- Toàn bộ frontend source-contract tests: 15/15 PASS.
- Backend tests: 106/106 PASS.
- Desktop check + Excel <-> DB contract: PASS.

## Ghi chú build sandbox
`npm --prefix frontend run typecheck` trong sandbox không thể hoàn tất do ZIP không đóng gói `vite/client` và `@types/node`. Trên máy dự án chạy `npm run install:all` trước `npm run verify`.
