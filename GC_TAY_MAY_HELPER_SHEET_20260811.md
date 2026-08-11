# KTC - Sheet phụ TAY MÁY CẮT LỒNG

## Mục tiêu
Giữ nguyên sheet dữ liệu chính `CẮT LỒNG`, đồng thời bổ sung một sheet hiển thị `TAY MÁY CẮT LỒNG` để lưu/đối chiếu metadata mà dòng dữ liệu chính có thể không biểu diễn đầy đủ.

## Luồng sử dụng
1. Manager sửa hoặc thêm dòng ở sheet `CẮT LỒNG`.
2. Bấm `Cập nhật DB từ Excel` trên Desktop.
3. Với report cũ, sheet phụ được đối chiếu theo `ID` và tự giữ CẮT/LỒNG, TAY/MÁY, Máy từ dữ liệu đã xuất.
4. Với dòng mới chưa có ID, Desktop tự bổ sung dòng tương ứng vào sheet `TAY MÁY CẮT LỒNG` nếu file cho phép ghi.
5. Nếu thiếu `Loại thao tác`, `Chế độ`, hoặc `Máy` khi chọn MÁY, preview bị chặn và báo đúng trường còn thiếu.
6. Manager điền thông tin còn thiếu trong sheet phụ, lưu Excel, rồi bấm `Cập nhật DB từ Excel` lại.
7. Backend vẫn validate toàn bộ nghiệp vụ trước khi tạo/cập nhật report.

## Cột sheet phụ
`Dòng nguồn | ID | Mã NV | Ca | Mã SP | Loại thao tác | Chế độ | Máy | Trạng thái | Thiếu thông tin`

- `Loại thao tác`: CẮT / LỒNG
- `Chế độ`: TAY / MÁY
- `Máy`: bắt buộc khi Chế độ = MÁY

## An toàn
- Không dùng sheet phụ để sửa các chỉ số hệ thống tự tính.
- Dòng mới không đủ metadata không được gửi xuống DB.
- Nếu Excel đang mở và Windows khóa file, Desktop sẽ cảnh báo đóng Excel rồi thử lại để có thể tự bổ sung sheet phụ.
