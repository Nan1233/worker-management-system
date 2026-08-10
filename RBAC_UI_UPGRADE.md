# KTC RBAC & Enterprise UI Upgrade

## Access control
- `admin` luôn có toàn quyền để tránh tự khóa hệ thống.
- `manager`, `lead`, `worker` có quyền mặc định theo vai trò và có thể override trong Admin > Vai trò & quyền.
- Backend kiểm tra permission ở API nhạy cảm; frontend chỉ hiển thị menu/route được phép.
- Phạm vi công đoạn hiện có vẫn được giữ ở controller/model; permission không thay thế process scope.
- Activity log của Manager/Lead chỉ hiển thị thao tác của chính họ hoặc báo cáo thuộc công đoạn phụ trách.

## Migration
Chạy sau khi backup DB:

```cmd
npm run db:migrate
npm run db:indexes
```

Migration mới: `backend/migrations/009_role_permissions.sql`.

## UI
- Menu dùng SVG line icon, không dùng emoji hoạt hình.
- Desktop/Tablet/Mobile ưu tiên độ đọc dữ liệu; bảng được cuộn ngang thay vì ép cột.
- Admin có màn hình `Vai trò & quyền`.
- Các route trước đây có page nhưng thiếu menu đã được nối lại: Xuất báo cáo, Nhân sự, Thống kê, Hồ sơ Worker.
