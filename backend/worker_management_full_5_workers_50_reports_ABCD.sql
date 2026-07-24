-- ============================================================
-- WORKER MANAGEMENT SYSTEM - FULL DATABASE + SAMPLE DATA
-- MySQL 8 / TiDB compatible
-- Sample accounts password: 123456
-- 5 workers x 10 reports = 50 reports
-- 2 leaders, 2 managers, shifts A/B/C/D
-- Generated for project version 2026-07
-- ============================================================

DROP DATABASE IF EXISTS worker_management;
CREATE DATABASE worker_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE worker_management;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE users (
  id INT NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role ENUM('admin','manager','lead','worker') NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE workers (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  worker_code VARCHAR(30) NOT NULL,
  phone VARCHAR(20) NULL,
  department VARCHAR(100) NOT NULL DEFAULT 'Sản xuất',
  position VARCHAR(100) NOT NULL DEFAULT 'Công nhân',
  training_percent DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_workers_user (user_id), UNIQUE KEY uq_workers_code (worker_code),
  CONSTRAINT fk_workers_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE processes (
  id INT NOT NULL AUTO_INCREMENT,
  process_code VARCHAR(30) NOT NULL,
  process_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_process_code (process_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE machines (
  id INT NOT NULL AUTO_INCREMENT,
  process_id INT NOT NULL,
  machine_code VARCHAR(50) NOT NULL,
  machine_name VARCHAR(100) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_machine_process_code (process_id,machine_code),
  CONSTRAINT fk_machine_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_standards (
  id INT NOT NULL AUTO_INCREMENT,
  process_id INT NOT NULL,
  work_type VARCHAR(30) NOT NULL,
  product_code VARCHAR(50) NOT NULL,
  standard_output INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_product_standard (process_id,work_type,product_code),
  CONSTRAINT fk_product_standard_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE worker_processes (
  id INT NOT NULL AUTO_INCREMENT, worker_id INT NOT NULL, process_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_worker_process (worker_id,process_id),
  CONSTRAINT fk_worker_process_worker FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  CONSTRAINT fk_worker_process_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE manager_processes (
  id INT NOT NULL AUTO_INCREMENT, manager_id INT NOT NULL, process_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_manager_process (manager_id,process_id),
  CONSTRAINT fk_manager_process_user FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_manager_process_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE defect_types (
  id INT NOT NULL AUTO_INCREMENT, process_id INT NOT NULL, defect_code VARCHAR(50) NOT NULL,
  defect_name VARCHAR(150) NOT NULL, sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_defect_process_code (process_id,defect_code),
  CONSTRAINT fk_defect_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE deduction_types (
  id INT NOT NULL AUTO_INCREMENT, process_id INT NOT NULL, deduction_code VARCHAR(50) NOT NULL,
  deduction_name VARCHAR(150) NOT NULL, sort_order INT NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_deduction_process_code (process_id,deduction_code),
  CONSTRAINT fk_deduction_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_reports_temp (
  id INT NOT NULL AUTO_INCREMENT, worker_id INT NOT NULL, process_id INT NOT NULL,
  work_date DATE NOT NULL, shift ENUM('A','B','C','D') NOT NULL,
  machine_no VARCHAR(50) NULL, training_percent DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  product_name VARCHAR(100) NULL, standard_output INT UNSIGNED NOT NULL DEFAULT 0,
  actual_output INT NOT NULL DEFAULT 0, total_time DECIMAL(8,3) NOT NULL DEFAULT 0,
  actual_time DECIMAL(8,3) NOT NULL DEFAULT 0, deduction_time DECIMAL(8,3) NOT NULL DEFAULT 0,
  tt_ok INT NOT NULL DEFAULT 0, tt_ng INT NOT NULL DEFAULT 0,
  stop_reason VARCHAR(255) NULL, note TEXT NULL, client_request_id VARCHAR(64) NULL,
  status ENUM('pending','need_fix','approved','rejected') NOT NULL DEFAULT 'pending',
  review_note TEXT NULL, reviewed_by INT NULL, updated_by INT NULL, approved_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_temp_worker_request (worker_id,client_request_id),
  KEY idx_temp_status_date (status,work_date), KEY idx_temp_duplicate (work_date,shift,machine_no,product_name),
  CONSTRAINT fk_temp_worker FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  CONSTRAINT fk_temp_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE,
  CONSTRAINT fk_temp_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_temp_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_reports (
  id INT NOT NULL AUTO_INCREMENT, source_temp_id INT NULL, worker_id INT NOT NULL, process_id INT NOT NULL,
  work_date DATE NOT NULL, shift ENUM('A','B','C','D') NOT NULL,
  machine_no VARCHAR(50) NULL, training_percent DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  product_name VARCHAR(100) NULL, standard_output INT UNSIGNED NOT NULL DEFAULT 0,
  actual_output INT NOT NULL DEFAULT 0, total_time DECIMAL(8,3) NOT NULL DEFAULT 0,
  actual_time DECIMAL(8,3) NOT NULL DEFAULT 0, deduction_time DECIMAL(8,3) NOT NULL DEFAULT 0,
  tt_ok INT NOT NULL DEFAULT 0, tt_ng INT NOT NULL DEFAULT 0,
  stop_reason VARCHAR(255) NULL, note TEXT NULL,
  status ENUM('pending','need_fix','approved','rejected') NOT NULL DEFAULT 'approved',
  review_note TEXT NULL, reviewed_by INT NULL, approved_by INT NULL, updated_by INT NULL,
  approved_at TIMESTAMP NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_report_source_temp (source_temp_id),
  KEY idx_report_date_process (work_date,process_id), KEY idx_report_worker_date (worker_id,work_date),
  CONSTRAINT fk_report_worker FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_report_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_report_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_temp_defects (
  id INT NOT NULL AUTO_INCREMENT, temp_report_id INT NOT NULL, defect_type_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_temp_report_defect (temp_report_id,defect_type_id),
  CONSTRAINT fk_temp_defect_report FOREIGN KEY (temp_report_id) REFERENCES production_reports_temp(id) ON DELETE CASCADE,
  CONSTRAINT fk_temp_defect_type FOREIGN KEY (defect_type_id) REFERENCES defect_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_temp_deductions (
  id INT NOT NULL AUTO_INCREMENT, temp_report_id INT NOT NULL, deduction_type_id INT NOT NULL,
  hours DECIMAL(8,3) NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_temp_report_deduction (temp_report_id,deduction_type_id),
  CONSTRAINT fk_temp_deduction_report FOREIGN KEY (temp_report_id) REFERENCES production_reports_temp(id) ON DELETE CASCADE,
  CONSTRAINT fk_temp_deduction_type FOREIGN KEY (deduction_type_id) REFERENCES deduction_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_report_defects (
  id INT NOT NULL AUTO_INCREMENT, report_id INT NOT NULL, defect_type_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_report_defect (report_id,defect_type_id),
  CONSTRAINT fk_report_defect_report FOREIGN KEY (report_id) REFERENCES production_reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_defect_type FOREIGN KEY (defect_type_id) REFERENCES defect_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE production_report_deductions (
  id INT NOT NULL AUTO_INCREMENT, report_id INT NOT NULL, deduction_type_id INT NOT NULL,
  hours DECIMAL(8,3) NOT NULL DEFAULT 0, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_report_deduction (report_id,deduction_type_id),
  CONSTRAINT fk_report_deduction_report FOREIGN KEY (report_id) REFERENCES production_reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_report_deduction_type FOREIGN KEY (deduction_type_id) REFERENCES deduction_types(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE report_action_logs (
  id BIGINT NOT NULL AUTO_INCREMENT, report_type ENUM('temp','approved') NOT NULL,
  report_id INT NOT NULL, user_id INT NOT NULL,
  action ENUM('CREATE','VIEW','UPDATE','APPROVE','REJECT','REQUEST_FIX','DELETE','EXPORT') NOT NULL,
  note TEXT NULL, ip_address VARCHAR(45) NULL, user_agent VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), KEY idx_action_target (report_type,report_id,created_at),
  CONSTRAINT fk_action_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE worker_training_logs (
  id BIGINT NOT NULL AUTO_INCREMENT, worker_id INT NOT NULL,
  old_percent DECIMAL(5,2) NULL, new_percent DECIMAL(5,2) NOT NULL,
  changed_by INT NOT NULL, reason VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id), CONSTRAINT fk_training_worker FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  CONSTRAINT fk_training_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE google_sheets (
  id BIGINT NOT NULL AUTO_INCREMENT, report_date DATE NOT NULL,
  spreadsheet_id VARCHAR(255) NOT NULL, spreadsheet_url VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_google_sheet_date (report_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE integration_sync_jobs (
    id BIGINT NOT NULL AUTO_INCREMENT,

    job_type ENUM(
        'google_sheet',
        'monthly_excel'
    ) NOT NULL,

    job_key VARCHAR(100) NOT NULL,

    work_date DATE NULL,
    report_month CHAR(7) NULL,
    process_id INT NULL,

    status ENUM(
        'pending',
        'processing',
        'success',
        'failed'
    ) NOT NULL DEFAULT 'pending',

    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 8,

    next_retry_at DATETIME NULL,
    locked_at DATETIME NULL,

    last_error TEXT NULL,
    result_url TEXT NULL,
    completed_at DATETIME NULL,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_sync_job (
        job_type,
        job_key
    ),

    KEY idx_sync_ready (
        status,
        next_retry_at
    ),

    KEY idx_sync_month (
        report_month,
        process_id
    )
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;
-- USERS (password all accounts: 123456)
INSERT INTO users (username,password,full_name,role,status) VALUES
('admin','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Quản trị hệ thống','admin','active'),
('manager1','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Nguyễn Văn Quản','manager','active'),
('manager2','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Trần Thị Hoa','manager','active'),
('lead1','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Phạm Minh Long','lead','active'),
('lead2','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Lê Thu Trang','lead','active'),
('1001','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Nguyễn Văn An','worker','active'),
('1002','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Trần Thị Bình','worker','active'),
('1003','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Lê Văn Cường','worker','active'),
('1004','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Phạm Thị Dung','worker','active'),
('1005','$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2','Hoàng Văn Em','worker','active');

INSERT INTO workers (user_id,worker_code,phone,department,position,training_percent,status) VALUES
(6,'1001','0901000001','Sản xuất','Công nhân',100,'active'),
(7,'1002','0901000002','Sản xuất','Công nhân',90,'active'),
(8,'1003','0901000003','Sản xuất','Công nhân',80,'active'),
(9,'1004','0901000004','Sản xuất','Công nhân',100,'active'),
(10,'1005','0901000005','Sản xuất','Công nhân',70,'active');

INSERT INTO processes (process_code,process_name,description,status) VALUES
('GC','Gia công','Cắt và lồng sản phẩm','active'),
('MAI','Mài','Mài hoàn thiện sản phẩm','active'),
('K1','Kiểm 1','Kiểm tra lần 1','active'),
('K2','Kiểm 2','Kiểm tra lần 2 và đóng gói','active');

INSERT INTO machines (process_id,machine_code,machine_name,status) VALUES
(1,'CAT-01','Máy cắt 01','active'),(1,'CAT-02','Máy cắt 02','active'),(1,'LONG-01','Máy lồng 01','active'),(1,'LONG-02','Máy lồng 02','active'),
(2,'MAI-01','Máy mài 01','active'),(2,'MAI-02','Máy mài 02','active'),
(3,'K1-01','Bàn kiểm 1-01','active'),(3,'K1-02','Bàn kiểm 1-02','active'),
(4,'K2-01','Bàn kiểm 2-01','active'),(4,'K2-02','Bàn kiểm 2-02','active');

INSERT INTO product_standards (process_id,work_type,product_code,standard_output,status) VALUES
(1,'Cắt','C2556-2',7200,'active'),(1,'Cắt','C2556-11',6600,'active'),(1,'Cắt','C2821',2400,'active'),
(1,'Lồng','9740',420,'active'),(1,'Lồng','2801',605,'active'),(1,'Lồng','8484',540,'active'),
(2,'Mài','MAI-2556',1800,'active'),(2,'Mài','MAI-2821',1600,'active'),
(3,'Kiểm 1','K1-2556',3000,'active'),(3,'Kiểm 1','K1-2821',2400,'active'),
(4,'Kiểm 2','K2-2556',2800,'active'),(4,'Kiểm 2','K2-2821',2200,'active');

INSERT INTO worker_processes (worker_id,process_id) VALUES
(1,1),(1,2),(2,1),(2,3),(3,2),(3,3),(4,1),(4,4),(5,3),(5,4);

-- Manager/leader process assignments
INSERT INTO manager_processes (manager_id,process_id) VALUES
(2,1),(2,2),(2,3),(2,4),(3,1),(3,2),(3,3),(3,4),
(4,1),(4,2),(5,3),(5,4);

INSERT INTO defect_types (process_id,defect_code,defect_name,sort_order,status) VALUES
(1,'KQD_DL','KQD dập lại',1,'active'),(1,'KQD_TUOT','KQD tuốt',2,'active'),(1,'VO_LONG','Vỡ do lồng',3,'active'),(1,'XUOC_LONG','Xước do lồng',4,'active'),
(1,'CONG_GAY','Cong gãy',5,'active'),(1,'XOAY','Xoay',6,'active'),(1,'KHONG_DUT','Không đứt',7,'active'),(1,'BAVIA','Bavia',8,'active'),
(2,'ME','Mẻ cạnh',1,'active'),(2,'XUOC','Xước',2,'active'),(2,'SAI_KT','Sai kích thước',3,'active'),
(3,'NGOAI_QUAN','Ngoại quan',1,'active'),(3,'THIEU_CT','Thiếu chi tiết',2,'active'),(3,'SAI_MAU','Sai màu',3,'active'),
(4,'TEM','Tem sai',1,'active'),(4,'DONG_GOI','Đóng gói sai',2,'active'),(4,'THUNG','Thùng lỗi',3,'active');

INSERT INTO deduction_types (process_id,deduction_code,deduction_name,sort_order,status) VALUES
(1,'THIEU_SP','Thiếu sản lượng',1,'active'),(1,'BAT_MAY','Bật máy, xét máy',2,'active'),(1,'CHUYEN_MA','Chuyển mã',3,'active'),(1,'CHINH_MAY','Chỉnh máy',4,'active'),
(1,'CHO_CHINH_MAY','Chờ chỉnh máy',5,'active'),(1,'MAT_DIEN','Mất điện',6,'active'),(1,'MAT_KHI','Mất khí',7,'active'),(1,'CHO_HANG','Chờ hàng',8,'active'),
(1,'BAO_DUONG','Bảo dưỡng máy',9,'active'),(1,'NGHI_GIAI_LAO','Nghỉ giải lao',10,'active'),(1,'GIAO_CA','Giao ca',11,'active'),(1,'HO_TRO','Dừng máy đi hỗ trợ',12,'active'),
(1,'5S','5S',13,'active'),(1,'DAO_TAO','Học việc, đào tạo',14,'active'),
(2,'CHINH_MAY','Chỉnh máy',1,'active'),(2,'THAY_DA','Thay đá',2,'active'),(2,'BAO_DUONG','Bảo dưỡng máy',3,'active'),(2,'5S','5S',4,'active'),
(3,'HOP','Họp',1,'active'),(3,'DAO_TAO','Đào tạo',2,'active'),(3,'CHO_HANG','Chờ hàng',3,'active'),
(4,'HOP','Họp',1,'active'),(4,'DAO_TAO','Đào tạo',2,'active'),(4,'DONG_GOI','Chuẩn bị đóng gói',3,'active');

-- 25 PENDING REPORTS: 5 per worker
INSERT INTO production_reports_temp (id,worker_id,process_id,work_date,shift,machine_no,training_percent,product_name,standard_output,actual_output,total_time,actual_time,deduction_time,tt_ok,tt_ng,note,client_request_id,status,created_at,updated_at) VALUES
(1,1,1,'2026-07-11','B','CAT-02',100,'C2556-11',6600,6187,8.0,7.5,0.5,6185,2,'Dữ liệu mẫu công nhân 1001, báo cáo 1','seed-1-01','pending',CONCAT('2026-07-11',' 08:00:00'),CONCAT('2026-07-11',' 08:00:00')),
(2,1,2,'2026-07-12','C','MAI-01',100,'MAI-2556',1800,1740,8.0,7.75,0.25,1737,3,'Dữ liệu mẫu công nhân 1001, báo cáo 2','seed-1-02','pending',CONCAT('2026-07-12',' 08:00:00'),CONCAT('2026-07-12',' 08:00:00')),
(3,1,1,'2026-07-13','D','LONG-02',100,'2801',605,599,8.0,8.0,0,595,4,'Dữ liệu mẫu công nhân 1001, báo cáo 3','seed-1-03','pending',CONCAT('2026-07-13',' 08:00:00'),CONCAT('2026-07-13',' 08:00:00')),
(4,1,2,'2026-07-14','A','MAI-01',100,'MAI-2556',1800,1678,8.0,7.5,0.5,1673,5,'Dữ liệu mẫu công nhân 1001, báo cáo 4','seed-1-04','pending',CONCAT('2026-07-14',' 08:00:00'),CONCAT('2026-07-14',' 08:00:00')),
(5,1,1,'2026-07-15','B','CAT-02',100,'C2556-11',6600,6381,8.0,7.75,0.25,6375,6,'Dữ liệu mẫu công nhân 1001, báo cáo 5','seed-1-05','pending',CONCAT('2026-07-15',' 08:00:00'),CONCAT('2026-07-15',' 08:00:00')),
(6,2,1,'2026-07-11','C','LONG-01',90,'9740',420,354,8.0,7.5,0.5,351,3,'Dữ liệu mẫu công nhân 1002, báo cáo 1','seed-2-01','pending',CONCAT('2026-07-11',' 08:00:00'),CONCAT('2026-07-11',' 08:00:00')),
(7,2,3,'2026-07-12','D','K1-02',90,'K1-2821',2400,2089,8.0,7.75,0.25,2085,4,'Dữ liệu mẫu công nhân 1002, báo cáo 2','seed-2-02','pending',CONCAT('2026-07-12',' 08:00:00'),CONCAT('2026-07-12',' 08:00:00')),
(8,2,1,'2026-07-13','A','CAT-01',90,'C2556-2',7200,6474,8.0,8.0,0,6469,5,'Dữ liệu mẫu công nhân 1002, báo cáo 3','seed-2-03','pending',CONCAT('2026-07-13',' 08:00:00'),CONCAT('2026-07-13',' 08:00:00')),
(9,2,3,'2026-07-14','B','K1-02',90,'K1-2821',2400,2016,8.0,7.5,0.5,2010,6,'Dữ liệu mẫu công nhân 1002, báo cáo 4','seed-2-04','pending',CONCAT('2026-07-14',' 08:00:00'),CONCAT('2026-07-14',' 08:00:00')),
(10,2,1,'2026-07-15','C','LONG-01',90,'9740',420,354,8.0,7.75,0.25,347,7,'Dữ liệu mẫu công nhân 1002, báo cáo 5','seed-2-05','pending',CONCAT('2026-07-15',' 08:00:00'),CONCAT('2026-07-15',' 08:00:00')),
(11,3,2,'2026-07-11','D','MAI-02',80,'MAI-2821',1600,1200,8.0,7.5,0.5,1196,4,'Dữ liệu mẫu công nhân 1003, báo cáo 1','seed-3-01','pending',CONCAT('2026-07-11',' 08:00:00'),CONCAT('2026-07-11',' 08:00:00')),
(12,3,3,'2026-07-12','A','K1-01',80,'K1-2556',3000,2322,8.0,7.75,0.25,2317,5,'Dữ liệu mẫu công nhân 1003, báo cáo 2','seed-3-02','pending',CONCAT('2026-07-12',' 08:00:00'),CONCAT('2026-07-12',' 08:00:00')),
(13,3,2,'2026-07-13','B','MAI-02',80,'MAI-2821',1600,1274,8.0,8.0,0,1268,6,'Dữ liệu mẫu công nhân 1003, báo cáo 3','seed-3-03','pending',CONCAT('2026-07-13',' 08:00:00'),CONCAT('2026-07-13',' 08:00:00')),
(14,3,3,'2026-07-14','C','K1-01',80,'K1-2556',3000,2241,8.0,7.5,0.5,2234,7,'Dữ liệu mẫu công nhân 1003, báo cáo 4','seed-3-04','pending',CONCAT('2026-07-14',' 08:00:00'),CONCAT('2026-07-14',' 08:00:00')),
(15,3,2,'2026-07-15','D','MAI-02',80,'MAI-2821',1600,1228,8.0,7.75,0.25,1227,1,'Dữ liệu mẫu công nhân 1003, báo cáo 5','seed-3-05','pending',CONCAT('2026-07-15',' 08:00:00'),CONCAT('2026-07-15',' 08:00:00')),
(16,4,1,'2026-07-11','A','CAT-01',100,'C2556-2',7200,6750,8.0,7.5,0.5,6745,5,'Dữ liệu mẫu công nhân 1004, báo cáo 1','seed-4-01','pending',CONCAT('2026-07-11',' 08:00:00'),CONCAT('2026-07-11',' 08:00:00')),
(17,4,4,'2026-07-12','B','K2-02',100,'K2-2821',2200,2128,8.0,7.75,0.25,2122,6,'Dữ liệu mẫu công nhân 1004, báo cáo 2','seed-4-02','pending',CONCAT('2026-07-12',' 08:00:00'),CONCAT('2026-07-12',' 08:00:00')),
(18,4,1,'2026-07-13','C','LONG-01',100,'9740',420,414,8.0,8.0,0,407,7,'Dữ liệu mẫu công nhân 1004, báo cáo 3','seed-4-03','pending',CONCAT('2026-07-13',' 08:00:00'),CONCAT('2026-07-13',' 08:00:00')),
(19,4,4,'2026-07-14','D','K2-02',100,'K2-2821',2200,2053,8.0,7.5,0.5,2052,1,'Dữ liệu mẫu công nhân 1004, báo cáo 4','seed-4-04','pending',CONCAT('2026-07-14',' 08:00:00'),CONCAT('2026-07-14',' 08:00:00')),
(20,4,1,'2026-07-15','A','CAT-01',100,'C2556-2',7200,6963,8.0,7.75,0.25,6961,2,'Dữ liệu mẫu công nhân 1004, báo cáo 5','seed-4-05','pending',CONCAT('2026-07-15',' 08:00:00'),CONCAT('2026-07-15',' 08:00:00')),
(21,5,3,'2026-07-11','B','K1-02',70,'K1-2821',2400,1575,8.0,7.5,0.5,1569,6,'Dữ liệu mẫu công nhân 1005, báo cáo 1','seed-5-01','pending',CONCAT('2026-07-11',' 08:00:00'),CONCAT('2026-07-11',' 08:00:00')),
(22,5,4,'2026-07-12','C','K2-01',70,'K2-2556',2800,1895,8.0,7.75,0.25,1888,7,'Dữ liệu mẫu công nhân 1005, báo cáo 2','seed-5-02','pending',CONCAT('2026-07-12',' 08:00:00'),CONCAT('2026-07-12',' 08:00:00')),
(23,5,3,'2026-07-13','D','K1-02',70,'K1-2821',2400,1674,8.0,8.0,0,1673,1,'Dữ liệu mẫu công nhân 1005, báo cáo 3','seed-5-03','pending',CONCAT('2026-07-13',' 08:00:00'),CONCAT('2026-07-13',' 08:00:00')),
(24,5,4,'2026-07-14','A','K2-01',70,'K2-2556',2800,1828,8.0,7.5,0.5,1826,2,'Dữ liệu mẫu công nhân 1005, báo cáo 4','seed-5-04','pending',CONCAT('2026-07-14',' 08:00:00'),CONCAT('2026-07-14',' 08:00:00')),
(25,5,3,'2026-07-15','B','K1-02',70,'K1-2821',2400,1615,8.0,7.75,0.25,1612,3,'Dữ liệu mẫu công nhân 1005, báo cáo 5','seed-5-05','pending',CONCAT('2026-07-15',' 08:00:00'),CONCAT('2026-07-15',' 08:00:00'));
INSERT INTO production_temp_defects (temp_report_id,defect_type_id,quantity) VALUES
(1,1,2),
(2,9,3),
(3,1,4),
(4,9,5),
(5,1,6),
(6,1,3),
(7,12,4),
(8,1,5),
(9,12,6),
(10,1,7),
(11,9,4),
(12,12,5),
(13,9,6),
(14,12,7),
(15,9,1),
(16,1,5),
(17,15,6),
(18,1,7),
(19,15,1),
(20,1,2),
(21,12,6),
(22,15,7),
(23,12,1),
(24,15,2),
(25,12,3);
INSERT INTO production_temp_deductions (temp_report_id,deduction_type_id,hours) VALUES
(1,1,0.5),
(2,15,0.25),
(4,15,0.5),
(5,1,0.25),
(6,1,0.5),
(7,19,0.25),
(9,19,0.5),
(10,1,0.25),
(11,15,0.5),
(12,19,0.25),
(14,19,0.5),
(15,15,0.25),
(16,1,0.5),
(17,22,0.25),
(19,22,0.5),
(20,1,0.25),
(21,19,0.5),
(22,22,0.25),
(24,22,0.5),
(25,19,0.25);

-- 25 APPROVED REPORTS: 5 per worker
INSERT INTO production_reports (id,source_temp_id,worker_id,process_id,work_date,shift,machine_no,training_percent,product_name,standard_output,actual_output,total_time,actual_time,deduction_time,tt_ok,tt_ng,note,status,review_note,reviewed_by,approved_by,updated_by,approved_at,created_at,updated_at) VALUES
(1,NULL,1,2,'2026-07-16','C','MAI-01',100,'MAI-2556',1800,1785,8.0,8.0,0,1778,7,'Dữ liệu mẫu công nhân 1001, báo cáo 6','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-16',' 17:00:00'),CONCAT('2026-07-16',' 16:30:00'),CONCAT('2026-07-16',' 17:00:00')),
(2,NULL,1,1,'2026-07-17','D','LONG-02',100,'2801',605,549,8.0,7.5,0.5,548,1,'Dữ liệu mẫu công nhân 1001, báo cáo 7','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-17',' 17:00:00'),CONCAT('2026-07-17',' 16:30:00'),CONCAT('2026-07-17',' 17:00:00')),
(3,NULL,1,2,'2026-07-18','A','MAI-01',100,'MAI-2556',1800,1722,8.0,7.75,0.25,1720,2,'Dữ liệu mẫu công nhân 1001, báo cáo 8','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-18',' 17:00:00'),CONCAT('2026-07-18',' 16:30:00'),CONCAT('2026-07-18',' 17:00:00')),
(4,NULL,1,1,'2026-07-19','B','CAT-02',100,'C2556-11',6600,6576,8.0,8.0,0,6573,3,'Dữ liệu mẫu công nhân 1001, báo cáo 9','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-19',' 17:00:00'),CONCAT('2026-07-19',' 16:30:00'),CONCAT('2026-07-19',' 17:00:00')),
(5,NULL,1,2,'2026-07-20','C','MAI-01',100,'MAI-2556',1800,1660,8.0,7.5,0.5,1656,4,'Dữ liệu mẫu công nhân 1001, báo cáo 10','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-20',' 17:00:00'),CONCAT('2026-07-20',' 16:30:00'),CONCAT('2026-07-20',' 17:00:00')),
(6,NULL,2,3,'2026-07-16','D','K1-02',90,'K1-2821',2400,2145,8.0,8.0,0,2144,1,'Dữ liệu mẫu công nhân 1002, báo cáo 6','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-16',' 17:00:00'),CONCAT('2026-07-16',' 16:30:00'),CONCAT('2026-07-16',' 17:00:00')),
(7,NULL,2,1,'2026-07-17','A','CAT-01',90,'C2556-2',7200,6057,8.0,7.5,0.5,6055,2,'Dữ liệu mẫu công nhân 1002, báo cáo 7','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-17',' 17:00:00'),CONCAT('2026-07-17',' 16:30:00'),CONCAT('2026-07-17',' 17:00:00')),
(8,NULL,2,3,'2026-07-18','B','K1-02',90,'K1-2821',2400,2071,8.0,7.75,0.25,2068,3,'Dữ liệu mẫu công nhân 1002, báo cáo 8','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-18',' 17:00:00'),CONCAT('2026-07-18',' 16:30:00'),CONCAT('2026-07-18',' 17:00:00')),
(9,NULL,2,1,'2026-07-19','C','LONG-01',90,'9740',420,354,8.0,8.0,0,350,4,'Dữ liệu mẫu công nhân 1002, báo cáo 9','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-19',' 17:00:00'),CONCAT('2026-07-19',' 16:30:00'),CONCAT('2026-07-19',' 17:00:00')),
(10,NULL,2,3,'2026-07-20','D','K1-02',90,'K1-2821',2400,1998,8.0,7.5,0.5,1993,5,'Dữ liệu mẫu công nhân 1002, báo cáo 10','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-20',' 17:00:00'),CONCAT('2026-07-20',' 16:30:00'),CONCAT('2026-07-20',' 17:00:00')),
(11,NULL,3,3,'2026-07-16','A','K1-01',80,'K1-2556',3000,2385,8.0,8.0,0,2383,2,'Dữ liệu mẫu công nhân 1003, báo cáo 6','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-16',' 17:00:00'),CONCAT('2026-07-16',' 16:30:00'),CONCAT('2026-07-16',' 17:00:00')),
(12,NULL,3,2,'2026-07-17','B','MAI-02',80,'MAI-2821',1600,1182,8.0,7.5,0.5,1179,3,'Dữ liệu mẫu công nhân 1003, báo cáo 7','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-17',' 17:00:00'),CONCAT('2026-07-17',' 16:30:00'),CONCAT('2026-07-17',' 17:00:00')),
(13,NULL,3,3,'2026-07-18','C','K1-01',80,'K1-2556',3000,2304,8.0,7.75,0.25,2300,4,'Dữ liệu mẫu công nhân 1003, báo cáo 8','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-18',' 17:00:00'),CONCAT('2026-07-18',' 16:30:00'),CONCAT('2026-07-18',' 17:00:00')),
(14,NULL,3,2,'2026-07-19','D','MAI-02',80,'MAI-2821',1600,1256,8.0,8.0,0,1251,5,'Dữ liệu mẫu công nhân 1003, báo cáo 9','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-19',' 17:00:00'),CONCAT('2026-07-19',' 16:30:00'),CONCAT('2026-07-19',' 17:00:00')),
(15,NULL,3,3,'2026-07-20','A','K1-01',80,'K1-2556',3000,2223,8.0,7.5,0.5,2217,6,'Dữ liệu mẫu công nhân 1003, báo cáo 10','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-20',' 17:00:00'),CONCAT('2026-07-20',' 16:30:00'),CONCAT('2026-07-20',' 17:00:00')),
(16,NULL,4,4,'2026-07-16','B','K2-02',100,'K2-2821',2200,2185,8.0,8.0,0,2182,3,'Dữ liệu mẫu công nhân 1004, báo cáo 6','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-16',' 17:00:00'),CONCAT('2026-07-16',' 16:30:00'),CONCAT('2026-07-16',' 17:00:00')),
(17,NULL,4,1,'2026-07-17','C','LONG-01',100,'9740',420,375,8.0,7.5,0.5,371,4,'Dữ liệu mẫu công nhân 1004, báo cáo 7','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-17',' 17:00:00'),CONCAT('2026-07-17',' 16:30:00'),CONCAT('2026-07-17',' 17:00:00')),
(18,NULL,4,4,'2026-07-18','D','K2-02',100,'K2-2821',2200,2110,8.0,7.75,0.25,2105,5,'Dữ liệu mẫu công nhân 1004, báo cáo 8','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-18',' 17:00:00'),CONCAT('2026-07-18',' 16:30:00'),CONCAT('2026-07-18',' 17:00:00')),
(19,NULL,4,1,'2026-07-19','A','CAT-01',100,'C2556-2',7200,7176,8.0,8.0,0,7170,6,'Dữ liệu mẫu công nhân 1004, báo cáo 9','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-19',' 17:00:00'),CONCAT('2026-07-19',' 16:30:00'),CONCAT('2026-07-19',' 17:00:00')),
(20,NULL,4,4,'2026-07-20','B','K2-02',100,'K2-2821',2200,2035,8.0,7.5,0.5,2028,7,'Dữ liệu mẫu công nhân 1004, báo cáo 10','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-20',' 17:00:00'),CONCAT('2026-07-20',' 16:30:00'),CONCAT('2026-07-20',' 17:00:00')),
(21,NULL,5,4,'2026-07-16','C','K2-01',70,'K2-2556',2800,1945,8.0,8.0,0,1941,4,'Dữ liệu mẫu công nhân 1005, báo cáo 6','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-16',' 17:00:00'),CONCAT('2026-07-16',' 16:30:00'),CONCAT('2026-07-16',' 17:00:00')),
(22,NULL,5,3,'2026-07-17','D','K1-02',70,'K1-2821',2400,1557,8.0,7.5,0.5,1552,5,'Dữ liệu mẫu công nhân 1005, báo cáo 7','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-17',' 17:00:00'),CONCAT('2026-07-17',' 16:30:00'),CONCAT('2026-07-17',' 17:00:00')),
(23,NULL,5,4,'2026-07-18','A','K2-01',70,'K2-2556',2800,1877,8.0,7.75,0.25,1871,6,'Dữ liệu mẫu công nhân 1005, báo cáo 8','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-18',' 17:00:00'),CONCAT('2026-07-18',' 16:30:00'),CONCAT('2026-07-18',' 17:00:00')),
(24,NULL,5,3,'2026-07-19','B','K1-02',70,'K1-2821',2400,1656,8.0,8.0,0,1649,7,'Dữ liệu mẫu công nhân 1005, báo cáo 9','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-19',' 17:00:00'),CONCAT('2026-07-19',' 16:30:00'),CONCAT('2026-07-19',' 17:00:00')),
(25,NULL,5,4,'2026-07-20','C','K2-01',70,'K2-2556',2800,1810,8.0,7.5,0.5,1809,1,'Dữ liệu mẫu công nhân 1005, báo cáo 10','approved','Đã duyệt dữ liệu mẫu',2,2,2,CONCAT('2026-07-20',' 17:00:00'),CONCAT('2026-07-20',' 16:30:00'),CONCAT('2026-07-20',' 17:00:00'));
INSERT INTO production_report_defects (report_id,defect_type_id,quantity) VALUES
(1,9,7),
(2,1,1),
(3,9,2),
(4,1,3),
(5,9,4),
(6,12,1),
(7,1,2),
(8,12,3),
(9,1,4),
(10,12,5),
(11,12,2),
(12,9,3),
(13,12,4),
(14,9,5),
(15,12,6),
(16,15,3),
(17,1,4),
(18,15,5),
(19,1,6),
(20,15,7),
(21,15,4),
(22,12,5),
(23,15,6),
(24,12,7),
(25,15,1);
INSERT INTO production_report_deductions (report_id,deduction_type_id,hours) VALUES
(2,1,0.5),
(3,15,0.25),
(5,15,0.5),
(7,1,0.5),
(8,19,0.25),
(10,19,0.5),
(12,15,0.5),
(13,19,0.25),
(15,19,0.5),
(17,1,0.5),
(18,22,0.25),
(20,22,0.5),
(22,19,0.5),
(23,22,0.25),
(25,22,0.5);

-- Audit logs for sample records
INSERT INTO report_action_logs (report_type,report_id,user_id,action,note)
SELECT 'temp',production_reports_temp.id,workers.user_id,'CREATE','Tạo dữ liệu kiểm thử'
FROM production_reports_temp JOIN workers ON workers.id=production_reports_temp.worker_id;

INSERT INTO report_action_logs (report_type,report_id,user_id,action,note)
SELECT 'approved',id,2,'APPROVE','Manager duyệt dữ liệu kiểm thử'
FROM production_reports;

-- Initial sync jobs for July 2026
INSERT INTO integration_sync_jobs (
    job_type,
    job_key,
    work_date,
    report_month,
    process_id,
    status,
    next_retry_at
)
VALUES
(
    'google_sheet',
    'google_sheet:2026-07-16',
    '2026-07-16',
    '2026-07',
    NULL,
    'pending',
    NOW()
),
(
    'google_sheet',
    'google_sheet:2026-07-17',
    '2026-07-17',
    '2026-07',
    NULL,
    'pending',
    NOW()
),
(
    'google_sheet',
    'google_sheet:2026-07-18',
    '2026-07-18',
    '2026-07',
    NULL,
    'pending',
    NOW()
),
(
    'google_sheet',
    'google_sheet:2026-07-19',
    '2026-07-19',
    '2026-07',
    NULL,
    'pending',
    NOW()
),
(
    'google_sheet',
    'google_sheet:2026-07-20',
    '2026-07-20',
    '2026-07',
    NULL,
    'pending',
    NOW()
),
(
    'monthly_excel',
    'monthly_excel:2026-07',
    '2026-07-20',
    '2026-07',
    NULL,
    'pending',
    NOW()
);

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- VERIFY SAMPLE DATA
-- ============================================================
SELECT role, COUNT(*) AS total_users FROM users GROUP BY role ORDER BY role;
SELECT COUNT(*) AS total_workers FROM workers;
SELECT worker_id, COUNT(*) AS pending_reports FROM production_reports_temp GROUP BY worker_id ORDER BY worker_id;
SELECT worker_id, COUNT(*) AS approved_reports FROM production_reports GROUP BY worker_id ORDER BY worker_id;
SELECT shift, COUNT(*) AS total_reports FROM (
  SELECT shift FROM production_reports_temp
  UNION ALL
  SELECT shift FROM production_reports
) x GROUP BY shift ORDER BY shift;