# Header biểu mẫu công nhân cố định

- Cụm **Quay lại + tiêu đề báo cáo + công nhân + % học việc + ngày báo cáo** dùng `position: sticky`.
- Áp dụng cho **desktop, tablet và mobile**, nằm ngay dưới `.worker-topbar`.
- Thanh menu chính của Worker có `z-index: 80`; cụm biểu mẫu dùng `z-index: 70` để không che menu.
- Trên mobile phần % học việc được ẩn để tiết kiệm chiều cao, nhưng tiêu đề, công nhân và ngày vẫn luôn nhìn thấy khi cuộn.
- Không dùng `position: fixed`, vì sticky giữ đúng chiều rộng form và không làm nội dung bị nhảy.
