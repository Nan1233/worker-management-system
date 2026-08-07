# KTC - Tách Excel tháng thành file riêng theo công đoạn (2026-08-07)

## Cấu trúc đầu ra mới

Khi bấm **Cập nhật Excel tháng** trên Desktop, hệ thống tạo/cập nhật đúng 10 file trong:

`Documents\KTC\Bao cao san xuat\YYYY\MM`

1. `00_TONG_HOP_SAN_XUAT_MM-YYYY.xlsx`
2. `01_CAN_MM-YYYY.xlsx`
3. `02_EP_MM-YYYY.xlsx`
4. `03_XU_LY_BAVIA_MM-YYYY.xlsx`
5. `04_CAT_LONG_MM-YYYY.xlsx`
6. `05_MAI_MM-YYYY.xlsx`
7. `06_DO_MM-YYYY.xlsx`
8. `07_KIEM_1_MM-YYYY.xlsx`
9. `08_KIEM_2_MM-YYYY.xlsx`
10. `09_SAN_XUAT_3_MM-YYYY.xlsx`

## Nội dung

- Mỗi file công đoạn chỉ chứa **một sheet đúng công đoạn đó**.
- File `00_TONG_HOP...` chứa `BÌA`, `TỔNG HỢP THÁNG` và `ĐỐI CHIẾU DỮ LIỆU`.
- Kể cả công đoạn chưa có dữ liệu trong tháng, file của công đoạn đó vẫn được tạo để cấu trúc thư mục luôn ổn định.
- Nguồn dữ liệu vẫn là `production_reports` đã duyệt từ TiDB.

## Các quy tắc được giữ nguyên

- All Borders toàn vùng bảng.
- Freeze đến hết cột Tên NV.
- Ngày báo cáo chia thành hàng phân cách; STT reset theo ngày.
- Thời gian nhập và ngày báo cáo tách riêng.
- Tổng SP/Tổng SP quy đổi chỉ lấy kết quả cuối cùng hợp lệ, không cộng dồn.
- Tổng OK, NG và thời gian vẫn tổng hợp theo nghiệp vụ hiện tại.
- Công đoạn có danh mục trừ giờ/NG riêng vẫn giữ nguyên cột chi tiết.

## Tương thích

Hàm dựng workbook gộp cũ vẫn được giữ trong source để không phá các contract/test cũ, nhưng luồng **Desktop cập nhật Excel tháng** sử dụng `buildSplitMonthlyWorkbooksLocal` và tạo 10 file riêng.

Các file gộp cũ (`Bao-cao-san-xuat-...xlsx`, `Du-lieu-doi-chieu-...xlsx`) không bị tự xóa để tránh mất dữ liệu người dùng; từ bản này Desktop không còn cập nhật chúng trong luồng tháng mới.
