KTC - FULL DB MIGRATION SAFE NO FK

Lỗi đã sửa:
001_core_master_schema.sql: fk_activity_user không tương thích users.id.

Bản này thay toàn bộ 001-011 bằng phiên bản không dùng FOREIGN KEY giữa các bảng master/audit để tương thích DB KTC cũ và TiDB.
Seed master tự tạo product_aliases, product_standard_variants, master_seed_runs nếu thiếu.

CÁCH CHẠY:
1. Chép đè thư mục backend của gói này vào project.
2. CMD:
   cd /d C:\VSCode\worker-management-system
   findstr /S /N /I "fk_activity_user FOREIGN KEY REFERENCES" backend\migrations\*.sql
   npm --prefix backend run db:migrate
   npm --prefix backend run db:verify-master

Lệnh findstr phải không trả về fk_activity_user/FOREIGN KEY/REFERENCES trong migrations 001-011 của gói này.
Không xóa schema_migrations. Migration 001 đang fail nên chưa được đánh dấu applied; runner sẽ chạy lại an toàn bằng CREATE TABLE IF NOT EXISTS.
