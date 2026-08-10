# KTC - Cập nhật giao diện và sản lượng máy theo Book2 (10/08/2026)

## Giao diện biểu mẫu công nhân
- Khối tên công nhân/ngày báo cáo thẳng lề với toàn bộ form, bỏ thụt trái 56px/46px.
- Nút `Làm mới` và `Lưu` nằm ở CUỐI NỘI DUNG TRANG, không còn `position: fixed` ở cuối màn hình.
- Trên điện thoại vẫn hiển thị cả hai nút ở cuối trang.

## Sản lượng nhiều máy
Mỗi máy giữ riêng:
- Máy.
- Sản phẩm.
- Thời gian chạy.
- Định mức SP/giờ.
- Thời gian chuẩn giây/SP nếu có.
- Sản lượng theo thời gian chạy = định mức SP/giờ x thời gian chạy máy.
- OK, NG, tổng thực tế và hiệu suất riêng của máy.

Sản lượng người khi chạy nhiều máy:
- OK người = tổng OK các máy.
- NG người = tổng NG các máy.
- Sản lượng người = tổng (OK + NG) của tất cả máy người đó chạy.
- Giờ định mức đạt được của người = tổng sản lượng tính TT từng máy / định mức từng máy.

## Book2(3).xlsx
Sheet `Máy` chứa danh mục máy theo công đoạn và một vùng định mức Mài theo:
- mã sản phẩm;
- máy áp dụng;
- thời gian chuẩn giây/SP;
- năng suất/giờ.

Đã trích được:
- 661 dòng biến thể sản phẩm-máy từ nguồn (sau khi bung các ô merge/danh sách máy);
- 659 cặp sản phẩm-máy đang dùng;
- 81 mã sản phẩm Mài;
- 2 xung đột nguồn: `QC4-6262` trên máy `3` và `5`. Cả hai phiên bản được giữ trong `product_machine_standard_variants`; bản ở dòng nguồn lớn hơn được dùng làm bản hiện hành để hệ thống có một giá trị xác định.

Không suy diễn Book2 thành định mức máy riêng cho Gia công/Đo/Ép vì vùng thời gian sản phẩm trong Book2 ghi rõ `THỜI GIAN MÀI SẢN PHẨM`.

## Quy tắc Gia công
Các máy tự động GC: 1,2,3,4,8,9,10,11,14,16,17,23,24,25,26.
Máy chia sẻ tối đa 2 người: 5,6,7,11.
Toàn bộ máy tự động và máy 5/6/7/11 có `output_basis='MACHINE'`.
Một người chỉ chạy nhiều máy GC nếu tất cả máy chọn là máy tự động, tối đa 4 máy.

## Migration
Chạy:
`npm --prefix backend run db:migrate`

Migration mới:
`backend/migrations/013_book2_machine_product_time_20260810.sql`
