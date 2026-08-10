KTC - SỬA LỖI MIGRATION fk_activity_user

Nguyên nhân:
- Migration 010 trên máy đang có FOREIGN KEY fk_activity_user.
- Kiểu activity_logs.user_id không giống tuyệt đối users.id của DB cũ.
- Migration dừng ở 010 nên 011 chưa tạo product_aliases/product_standard_variants.

Bản sửa:
1. 010_audit_governance_demo.sql không tạo FOREIGN KEY vào users để tương thích DB cũ/TiDB.
2. runMasterSeed.js tự tạo 3 bảng hỗ trợ seed nếu chưa tồn tại.
3. runMigrations.js báo rõ file migration gây lỗi.

Chép 4 file trong gói vào đúng vị trí trong project rồi chạy:
cd /d C:\VSCode\worker-management-system
npm --prefix backend run db:migrate
npm --prefix backend run db:verify-master

Nếu chỉ muốn kiểm tra seed sau đó:
npm --prefix backend run db:seed-master
npm --prefix backend run db:verify-master
