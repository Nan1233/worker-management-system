KTC - MIGRATION FULL DB + MASTER DATA
====================================

Mục đích
- Dùng được với TiDB/MySQL đã có schema hoặc database trắng.
- Tạo các bảng lõi từ migration 001-004.
- Chạy các migration nâng cấp 005-011.
- Tự seed dữ liệu gốc lấy từ file mẫu KTC sau migration.
- Book1(7).xlsx đã đối chiếu trùng 100%, không seed lần hai.
- Chạy lại không nhân đôi master data nhờ UPSERT/UNIQUE KEY.
- Không xóa báo cáo sản xuất đang có.

Dữ liệu snapshot tối thiểu đã kiểm kê
- 9 công đoạn
- 593 công nhân trong snapshot nguồn
- 115 máy
- 769 ánh xạ mã sản phẩm
- 2.019 biến thể định mức
- Danh mục trừ giờ và NG theo công đoạn
- 21 sheet nguồn đã kiểm kê

Cách áp dụng vào project
1. Sao lưu DB hiện tại trước khi chạy trên DB đang demo.
2. Chép toàn bộ file trong thư mục backend của gói này đè/tích hợp vào backend project.
3. Đảm bảo backend/.env đang trỏ đúng TiDB cần migrate.
4. Chạy:

   cd /d C:\VSCode\worker-management-system
   npm --prefix backend install
   npm --prefix backend run db:migrate
   npm --prefix backend run db:verify-master

Hoặc chạy CHAY_MIGRATE_FULL_DB.cmd sau khi gói đã được đặt đúng trong project.

Lưu ý
- db:migrate tự gọi runMasterSeed sau khi migration xong.
- Mật khẩu mặc định của worker seed lấy từ KTC_SEED_DEFAULT_PASSWORD; nếu không đặt thì là 123456.
- Migration không DROP bảng và không DELETE production_reports / production_reports_temp.
