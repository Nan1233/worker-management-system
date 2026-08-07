# KTC Professional UI - Final audit 2026-08-07

## Phạm vi đã rà
- Login
- Worker layout, chọn công đoạn, form nhập, lịch sử, chi tiết
- Manager/Lead/Admin layout
- Dashboard
- Chờ duyệt / Đã duyệt
- Duyệt nhiều báo cáo
- Chi tiết / chỉnh sửa báo cáo
- Trung tâm quản lý dữ liệu
- Công thức đầu ra
- Thống kê / trang trạng thái chưa triển khai
- Thông báo & lịch sử
- Governance
- Download/export
- Responsive mobile/tablet/desktop theo CSS breakpoints

## Sửa lỗi chính
1. Login: sửa kế thừa font sai, account gần đây, responsive và bàn phím username.
2. Management: tăng typography/control scale; bỏ cảm giác UI quá nhỏ; giảm double-padding.
3. Mobile management: khôi phục nút Đăng xuất ở bottom navigation.
4. Reports: thiết kế lại filter/action hierarchy; tăng input/button/table readability.
5. SelectedReportsReview: chỉ freeze STT + Mã NV + Họ tên; dùng CSS variables thay 8 left offset hard-code.
6. Đồng bộ màu legacy về KTC design tokens.
7. Đồng bộ Master/Formula/System/Governance/Download/Worker detail bằng design system chung.
8. Xóa App.css mẫu Vite không còn sử dụng.
9. Portable EXE đặt tên `KTC-Production-Control.exe` (package version vẫn giữ cho electron-builder).

## Audit tự động
- CSS `{}` balance: OK
- CSS imports: OK
- TS/TSX syntactic transpile: OK
- Backend JS syntax: OK
- Electron/Desktop syntax check: OK
- Legacy core colors (#2563eb/#0f766e/#1570ef/#3b82f6/#2e90fa): 0
- Selected review 8-column hard-coded sticky offsets: removed
- Active CSS `!important`: giảm còn mức thấp; phần còn lại chủ yếu legacy/semantic override.

## Hạn chế build trong sandbox
`npm ci --prefix frontend` không hoàn tất do registry nội bộ sandbox trả 404 cho `zod-validation-error@4.0.2`. Vì vậy full Vite build phải chạy trên máy Windows của dự án bằng `npm run verify`.
