-- Chạy một lần trên database hiện tại trước khi tạo tài khoản role lead.
USE worker_management;

ALTER TABLE users
MODIFY COLUMN role ENUM('admin', 'manager', 'lead', 'worker') NOT NULL;

-- Kiểm tra lại cấu trúc và dữ liệu role.
SHOW COLUMNS FROM users LIKE 'role';
SELECT id, username, full_name, role FROM users ORDER BY id;