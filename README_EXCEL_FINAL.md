# Báo cáo Excel sản xuất KTC

Bộ dựng Excel tháng không đọc hoặc sửa file mẫu khi chạy. File mẫu được dùng để xác định nghiệp vụ và cách chia nhóm, còn workbook đầu ra được tạo mới để tránh dữ liệu mẫu, công thức ngoài và lỗi OOXML.

## File báo cáo chính

- BÌA
- TỔNG HỢP THÁNG
- CÁN
- ÉP
- XỬ LÝ BAVIA
- CẮT LỒNG
- MÀI
- ĐO
- KIỂM 1
- KIỂM 2
- SẢN XUẤT 3
- ĐỐI CHIẾU DỮ LIỆU

Mỗi sheet dùng danh mục trừ giờ và NG riêng của đúng công đoạn từ TiDB. Danh mục active luôn được hiển thị; loại lịch sử có phát sinh trong tháng cũng được bổ sung.

Nguồn dữ liệu duy nhất là `production_reports` đã duyệt cùng các bảng chi tiết theo `report_id`.
