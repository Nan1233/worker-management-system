# Khắc phục báo cáo Excel thiếu công đoạn

Báo cáo tháng hiện ghi đủ các công đoạn đang được hệ thống hỗ trợ:

- CAN – Cán
- EP – Ép
- XLBV – Xử lý bavia
- GC – Gia công/Cắt lồng
- MAI – Mài
- DO – Đo
- K1 – Kiểm 1
- K2 – Kiểm 2
- SX3 – Sản xuất 3

Các thay đổi chính:

- Dùng `desktop/assets/templates/file-mau.xlsx`, là template thực tế có đủ các sheet công đoạn.
- Không còn hard-code chỉ ghi `GC` và `MAI` trong workbook tháng.
- Ghi dữ liệu theo toàn bộ `PROCESS_SHEETS`.
- File dữ liệu đối chiếu tổng hợp đủ mọi công đoạn.
- Tạo file công đoạn ngay cả khi tháng chưa có báo cáo đã duyệt.
- Sửa tên file đối chiếu trong công thức để trùng với file thực tế trên đĩa.

Kiểm tra:

```text
Backend tests: 33 pass, 0 fail, 0 cancelled
Desktop Electron syntax: OK
```
