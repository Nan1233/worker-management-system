# Cập nhật giao diện Worker 10/08/2026

## Đã sửa
- Mobile/tablet <= 860px: cố định toàn bộ vùng đầu trang khi cuộn gồm nút quay lại, tiêu đề báo cáo, tên/mã công nhân và ngày báo cáo.
- Header sticky nằm dưới Worker topbar bằng `top: var(--worker-topbar-height)` để không chồng lên thanh điều hướng.
- Có nền mờ, viền và shadow nhẹ để nội dung cuộn phía dưới không lẫn vào header.
- Dark mode có nền sticky riêng, không bị chói.
- Nút Cắt/Lồng/Tay/Máy dài ngang hơn.
- Màn hình >= 1080px: Loại gia công và Hình thức thực hiện nằm cùng một hàng.
- Màn hình nhỏ: tự xuống hàng, không ép ngang gây tràn.
- Nút Làm mới/Lưu vẫn nằm cuối nội dung form, không fixed cuối màn hình.

## Không thay đổi
- Không đổi API.
- Không đổi DB/schema.
- Không đổi quy tắc máy, sản lượng máy, Book2 hay công thức sản lượng.
- Không cần migration mới.
