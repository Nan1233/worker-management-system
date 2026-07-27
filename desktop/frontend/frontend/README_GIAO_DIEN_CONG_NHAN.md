# Nâng cấp giao diện KTC Production Management

## Nội dung đã sửa

- Thay trang đăng nhập cũ bằng giao diện hiện đại, responsive.
- Tự chuyển về trang đúng vai trò nếu phiên đăng nhập còn hiệu lực.
- Ghi nhớ tối đa 5 tài khoản gần đây.
- Chỉ lưu mã đăng nhập, họ tên và vai trò; không lưu mật khẩu.
- Cho phép chọn nhanh hoặc xóa tài khoản gợi ý.
- Thêm hiện/ẩn mật khẩu, loading và thông báo lỗi rõ ràng.
- Thêm WorkerLayout dùng chung cho toàn bộ khu vực công nhân.
- Thêm nút đăng xuất trên desktop và mobile.
- Thêm menu Trang chủ, Lịch sử báo cáo, Thông báo.
- Hiển thị họ tên và mã nhân viên đang đăng nhập.
- Thanh điều hướng mobile cố định phía dưới.

## Kiểm tra

```bash
npm ci
npm run lint
npm run build
```

Kết quả trên bản đóng gói:
- ESLint: 0 lỗi
- Production build: thành công

## Commit

```bash
git add frontend
git commit -m "feat: modernize login and add worker navigation logout"
git push origin main
```
