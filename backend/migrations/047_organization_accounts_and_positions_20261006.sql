-- KTC organization accounts / role-scope seed
-- 2026-10-06
-- Role remains technical RBAC: admin / manager / lead / worker.
-- Organization title is stored separately in users.position.
-- Manager access is scoped by manager_processes.

SET @has_position := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'position'
);
SET @sql := IF(
  @has_position = 0,
  'ALTER TABLE users ADD COLUMN position VARCHAR(120) NULL AFTER role',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS role_permission_overrides (
  role VARCHAR(20) NOT NULL,
  permission_code VARCHAR(80) NOT NULL,
  allowed TINYINT(1) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role, permission_code)
);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id BIGINT NOT NULL,
  permission_code VARCHAR(80) NOT NULL,
  allowed TINYINT(1) NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_code),
  INDEX idx_user_permission_user (user_id)
);

-- Correct the old draft username before inserting the canonical account.
UPDATE users u
LEFT JOIN users u2
  ON LOWER(TRIM(u2.username))='nguyenthphuong'
  AND u2.id<>u.id
SET u.username='nguyenthphuong'
WHERE LOWER(TRIM(u.username))='nguyenthihuong'
  AND u.full_name='NGUYỄN THỊ PHƯƠNG'
  AND u2.id IS NULL;

SET @default_password_hash := '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6';

INSERT INTO users (username,password,full_name,role,position,status) VALUES
('nagata',@default_password_hash,'NAGATA HIROKAZU','admin','Giám đốc','active'),
('nguyenxuanthang',@default_password_hash,'NGUYỄN XUÂN THẮNG','admin','Phó giám đốc','active'),
('phamthegioi',@default_password_hash,'PHẠM THẾ GIỚI','manager','Quản lý sản xuất','active'),
('daothihuong',@default_password_hash,'ĐÀO THỊ HƯƠNG','manager','Quản lý công đoạn','active'),
('nguyenvanlinh',@default_password_hash,'NGUYỄN VĂN LINH','manager','Quản lý công đoạn','active'),
('vudinhdong',@default_password_hash,'VŨ ĐÌNH ĐỒNG','manager','Kỹ thuật sản xuất','active'),
('doduleluong',@default_password_hash,'ĐỖ ĐỨC LƯƠNG','manager','Quản lý công đoạn','active'),
('nguyenducthao',@default_password_hash,'NGUYỄN ĐỨC THẢO','manager','Quản lý công đoạn','active'),
('dinhttuyet',@default_password_hash,'ĐINH THỊ TUYẾT','manager','Quản lý công đoạn','active'),
('dohienthu',@default_password_hash,'ĐỖ HIỀN THU','manager','Quản lý công đoạn','active'),
('nguyenvantuan',@default_password_hash,'NGUYỄN VĂN TUẤN','manager','Quản lý công đoạn','active'),
('nguyenhuunhan',@default_password_hash,'NGUYỄN HỮU NHÂN','manager','Quản lý công đoạn','active'),
('nguyenthphuong',@default_password_hash,'NGUYỄN THỊ PHƯƠNG','manager','Quản lý','active'),
('dinhthily',@default_password_hash,'ĐINH THỊ LY','manager','Quản lý công đoạn','active'),
('tranhuykhoi',@default_password_hash,'TRẦN HUY KHÔI','manager','Quản lý công đoạn','active'),
('khuongmtuyen',@default_password_hash,'KHƯƠNG M. TUYẾN','manager','Quản lý sản xuất','active')
ON DUPLICATE KEY UPDATE
  full_name=VALUES(full_name),
  role=VALUES(role),
  position=VALUES(position),
  status=VALUES(status);

-- Resolve process IDs by code so this seed is safe across databases.
DELETE mp FROM manager_processes mp
JOIN users u ON u.id=mp.manager_id
WHERE u.username IN (
  'phamthegioi','daothihuong','nguyenvanlinh','vudinhdong','doduleluong',
  'nguyenducthao','dinhttuyet','dohienthu','nguyenvantuan','nguyenhuunhan',
  'nguyenthphuong','dinhthily','tranhuykhoi','khuongmtuyen'
);

INSERT INTO manager_processes(manager_id,process_id)
SELECT u.id,p.id FROM users u JOIN processes p ON p.process_code='SX3'
WHERE u.username IN ('phamthegioi','khuongmtuyen');

INSERT INTO manager_processes(manager_id,process_id)
SELECT u.id,p.id FROM users u JOIN processes p ON p.process_code IN ('DO','K1','K2')
WHERE u.username IN ('daothihuong','dohienthu');

INSERT INTO manager_processes(manager_id,process_id)
SELECT u.id,p.id FROM users u JOIN processes p ON p.process_code IN ('GC','MAI')
WHERE u.username='nguyenvanlinh';

-- Kỹ thuật sản xuất: toàn bộ công đoạn sản xuất hiện có.
INSERT INTO manager_processes(manager_id,process_id)
SELECT u.id,p.id FROM users u CROSS JOIN processes p
WHERE u.username='vudinhdong'
  AND p.status='active'
  AND p.process_code IN ('GC','MAI','DO','K1','K2','XLBV','EP','CAN','SX3');

INSERT INTO manager_processes(manager_id,process_id)
SELECT u.id,p.id FROM users u JOIN processes p ON p.process_code IN ('CAN','EP','XLBV')
WHERE u.username IN ('doduleluong','nguyenducthao','dinhttuyet');

INSERT INTO manager_processes(manager_id,process_id)
SELECT u.id,p.id FROM users u JOIN processes p ON p.process_code='GC'
WHERE u.username IN ('nguyenvantuan','nguyenhuunhan');

INSERT INTO manager_processes(manager_id,process_id)
SELECT u.id,p.id FROM users u JOIN processes p ON p.process_code IN ('MAI','DO')
WHERE u.username IN ('dinhthily','tranhuykhoi');

-- Nguyễn Thị Phương: giữ role manager nhưng chưa tự ý gán scope
-- vì sơ đồ hiện có chưa xác định công đoạn phụ trách.

-- Ensure privileged accounts have no stale process restriction.
DELETE mp FROM manager_processes mp
JOIN users u ON u.id=mp.manager_id
WHERE u.role='admin';
