# Excel theo danh mục riêng từng công đoạn

File Bao-cao-san-xuat-MM-YYYY.xlsx tiếp tục dùng template người dùng `Bao-cao-san-xuat-08-2026_CHI_TIET.xlsx`.

Mỗi sheet công đoạn tự lấy:
- `deductionTypes` của đúng process từ API company-data.
- `defectTypes` của đúng process từ API company-data.
- `deductions` và `defects` của từng báo cáo để điền vào đúng cột.

Cột chung được giữ ổn định; sau đó chèn động các cột `Trừ giờ - ...` và `NG - ...` riêng theo từng công đoạn. Không dùng danh mục toàn cục, không lấy danh mục của Gia công/Mài áp cho các sheet khác.
