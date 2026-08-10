# Cập nhật sticky header biểu mẫu - 10/08/2026

Đã sửa `frontend/src/pages/worker/ProcessPage.css` để toàn bộ vùng đầu biểu mẫu công nhân cố định khi cuộn trên mọi kích thước màn hình.

Vùng cố định gồm:
- Nút quay lại.
- Tiêu đề công đoạn.
- Tên và mã công nhân.
- % học việc (desktop/tablet).
- Ngày báo cáo.

Vùng này nằm ngay dưới `worker-topbar`, không che menu trên cùng và không thay đổi business logic.
