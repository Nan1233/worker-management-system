# Báo cáo Excel sản xuất KTC

Bộ dựng Excel tháng không đọc hoặc sửa file mẫu khi chạy. File mẫu được dùng để xác định nghiệp vụ và cách chia nhóm, còn workbook đầu ra được tạo mới để tránh dữ liệu mẫu, công thức ngoài và lỗi OOXML.

## File Excel tháng trên Desktop

Từ 07/08/2026, mỗi công đoạn được tách thành một file riêng để dễ mở, lọc và chỉnh sửa:

- `00_TONG_HOP_SAN_XUAT_MM-YYYY.xlsx` (BÌA + TỔNG HỢP THÁNG + ĐỐI CHIẾU DỮ LIỆU)
- `01_CAN_MM-YYYY.xlsx`
- `02_EP_MM-YYYY.xlsx`
- `03_XU_LY_BAVIA_MM-YYYY.xlsx`
- `04_CAT_LONG_MM-YYYY.xlsx`
- `05_MAI_MM-YYYY.xlsx`
- `06_DO_MM-YYYY.xlsx`
- `07_KIEM_1_MM-YYYY.xlsx`
- `08_KIEM_2_MM-YYYY.xlsx`
- `09_SAN_XUAT_3_MM-YYYY.xlsx`

Mỗi file công đoạn chỉ có một sheet của đúng công đoạn. Nguồn dữ liệu duy nhất vẫn là `production_reports` đã duyệt cùng các bảng chi tiết theo `report_id`.

