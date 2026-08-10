# KTC – DB reset full 10/08/2026

Nguồn dữ liệu đã đối chiếu:
- file mẫu(6).xlsx — SHA256 `0aab63bffa213f335d06326231baa9a395455ab73d1aa19e0ef37182984704a4` (trùng file mẫu(5))
- Book1(8).xlsx — SHA256 `51f0dded6dcba4ae87b8a26ef72779235e2369e81b2ef562365f584a9605d667` (trùng Book1(7))
- Book2(4).xlsx — SHA256 `a9f6f677fe9c627b129933639a0b5064e3c2f88a4408ba7df3c6b381eb89dacd` (có thay đổi so với Book2(3))

Điều chỉnh Book2(4):
- QC8-1467: không còn thời gian chuẩn hợp lệ.
- QC8-1470: không còn thời gian chuẩn hợp lệ.
- Migration 015 xóa định mức máy cũ của hai mã này để không dùng nhầm 146 giây / 24.657534 SP/giờ.
- Các dòng Book2 hợp lệ còn lại được gắn nguồn `Book2(4).xlsx`.

Nhân sự:
- Snapshot chính: 593 mã duy nhất từ sheet Nhân sự.
- Bổ sung lịch sử có nguồn: `HẠO` (XLBV), `thu` (GC), `vấn` (MAI + DO).
- Tổng snapshot seed: 596 công nhân duy nhất.
- Không tạo công nhân giả để ép số lượng về DB cũ.

Tài khoản hệ thống:
- admin / 123456
- manager1 / 123456
- lead1 / 123456

Chạy DB mới:
1. Mở TiDB SQL Editor.
2. Chạy `backend/database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql`.
3. File này DROP database `worker_management`, tạo lại và nạp full dữ liệu.
4. Sau đó chạy:
   `npm --prefix backend run db:verify-master`
   `npm --prefix backend run db:migrate`

CẢNH BÁO: SQL reset sẽ xóa toàn bộ dữ liệu hiện có trong `worker_management`.
