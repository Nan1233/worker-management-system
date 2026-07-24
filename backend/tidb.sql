-- =====================================================
-- WORKER MANAGEMENT SYSTEM
-- FULL DATABASE
-- TiDB / MySQL
-- =====================================================


DROP DATABASE IF EXISTS worker_management;


CREATE DATABASE worker_management
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;


USE worker_management;


SET FOREIGN_KEY_CHECKS = 0;


-- =====================================================
-- 1. USERS
-- =====================================================

CREATE TABLE users
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    username VARCHAR(50)
    NOT NULL UNIQUE,

    password VARCHAR(255)
    NOT NULL,

    full_name VARCHAR(150)
    NOT NULL,

    role ENUM(
        'admin',
        'manager',
        'lead',
        'worker'
    )
    NOT NULL,

    status ENUM(
        'active',
        'inactive'
    )
    NOT NULL DEFAULT 'active',

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);


-- =====================================================
-- 2. WORKERS
-- =====================================================

CREATE TABLE workers
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT
    NOT NULL UNIQUE,

    worker_code VARCHAR(30)
    NOT NULL UNIQUE,

    phone VARCHAR(20),

    department VARCHAR(100)
    DEFAULT 'Sản xuất',

    position VARCHAR(100)
    DEFAULT 'Công nhân',

    training_percent DECIMAL(5,2)
    NOT NULL DEFAULT 100.00,

    status ENUM(
        'active',
        'inactive'
    )
    NOT NULL DEFAULT 'active',

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_workers_user
    FOREIGN KEY(user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);


-- =====================================================
-- 3. PROCESSES
-- =====================================================

CREATE TABLE processes
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    process_code VARCHAR(30)
    NOT NULL UNIQUE,

    process_name VARCHAR(100)
    NOT NULL,

    description VARCHAR(255),

    status ENUM(
        'active',
        'inactive'
    )
    NOT NULL DEFAULT 'active',

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP
);


-- =====================================================
-- 4. PRODUCT STANDARDS
-- ĐỊNH MỨC SẢN PHẨM
-- =====================================================

CREATE TABLE product_standards
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    process_id INT
    NOT NULL,

    work_type VARCHAR(30)
    NOT NULL,

    product_code VARCHAR(50)
    NOT NULL,

    standard_output INT UNSIGNED
    NOT NULL DEFAULT 0,

    status ENUM(
        'active',
        'inactive'
    )
    NOT NULL DEFAULT 'active',

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_product_standard_process
    FOREIGN KEY(process_id)
    REFERENCES processes(id)
    ON DELETE CASCADE,

    CONSTRAINT uq_product_standard
    UNIQUE(
        process_id,
        work_type,
        product_code
    )
);


-- =====================================================
-- 5. WORKER PROCESSES
-- CÔNG NHÂN ĐƯỢC LÀM CÔNG ĐOẠN NÀO
-- =====================================================

CREATE TABLE worker_processes
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    worker_id INT
    NOT NULL,

    process_id INT
    NOT NULL,

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_worker_process_worker
    FOREIGN KEY(worker_id)
    REFERENCES workers(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_worker_process_process
    FOREIGN KEY(process_id)
    REFERENCES processes(id)
    ON DELETE CASCADE,

    CONSTRAINT uq_worker_process
    UNIQUE(
        worker_id,
        process_id
    )
);


-- =====================================================
-- 6. MANAGER PROCESSES
-- BACKEND HIỆN ĐANG DÙNG TÊN manager_processes
-- MANAGER / LEAD PHỤ TRÁCH CÔNG ĐOẠN
-- =====================================================

CREATE TABLE manager_processes
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    manager_id INT
    NOT NULL,

    process_id INT
    NOT NULL,

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_manager_process_user
    FOREIGN KEY(manager_id)
    REFERENCES users(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_manager_process_process
    FOREIGN KEY(process_id)
    REFERENCES processes(id)
    ON DELETE CASCADE,

    CONSTRAINT uq_manager_process
    UNIQUE(
        manager_id,
        process_id
    )
);


-- =====================================================
-- 7. DEFECT TYPES
-- DANH MỤC LỖI NG
-- =====================================================

CREATE TABLE defect_types
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    process_id INT
    NOT NULL,

    defect_code VARCHAR(50)
    NOT NULL,

    defect_name VARCHAR(150)
    NOT NULL,

    sort_order INT
    NOT NULL DEFAULT 0,

    status ENUM(
        'active',
        'inactive'
    )
    NOT NULL DEFAULT 'active',

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_defect_process
    FOREIGN KEY(process_id)
    REFERENCES processes(id)
    ON DELETE CASCADE,

    CONSTRAINT uq_defect_process_code
    UNIQUE(
        process_id,
        defect_code
    )
);


-- =====================================================
-- 8. DEDUCTION TYPES
-- DANH MỤC TRỪ GIỜ
-- =====================================================

CREATE TABLE deduction_types
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    process_id INT
    NOT NULL,

    deduction_code VARCHAR(50)
    NOT NULL,

    deduction_name VARCHAR(150)
    NOT NULL,

    sort_order INT
    NOT NULL DEFAULT 0,

    status ENUM(
        'active',
        'inactive'
    )
    NOT NULL DEFAULT 'active',

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_deduction_process
    FOREIGN KEY(process_id)
    REFERENCES processes(id)
    ON DELETE CASCADE,

    CONSTRAINT uq_deduction_process_code
    UNIQUE(
        process_id,
        deduction_code
    )
);


-- =====================================================
-- 9. PRODUCTION REPORTS TEMP
-- BÁO CÁO CHƯA DUYỆT
-- =====================================================

CREATE TABLE production_reports_temp
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    worker_id INT
    NOT NULL,

    process_id INT
    NOT NULL,

    work_date DATE
    NOT NULL,

    shift VARCHAR(20)
    NOT NULL,

    machine_no VARCHAR(50),

    training_percent DECIMAL(5,2)
    NOT NULL DEFAULT 100.00,

    product_name VARCHAR(100),

    standard_output INT UNSIGNED
    NOT NULL DEFAULT 0,

    actual_output INT
    NOT NULL DEFAULT 0,

    total_time DECIMAL(8,3)
    NOT NULL DEFAULT 0,

    actual_time DECIMAL(8,3)
    NOT NULL DEFAULT 0,

    deduction_time DECIMAL(8,3)
    NOT NULL DEFAULT 0,

    tt_ok INT
    NOT NULL DEFAULT 0,

    tt_ng INT
    NOT NULL DEFAULT 0,

    stop_reason VARCHAR(255),

    note TEXT,

    status ENUM(
        'pending',
        'need_fix',
        'approved',
        'rejected'
    )
    NOT NULL DEFAULT 'pending',

    review_note TEXT,

    reviewed_by INT NULL,

    approved_at TIMESTAMP NULL,

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_temp_report_worker
    FOREIGN KEY(worker_id)
    REFERENCES workers(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_temp_report_process
    FOREIGN KEY(process_id)
    REFERENCES processes(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_temp_report_reviewer
    FOREIGN KEY(reviewed_by)
    REFERENCES users(id)
    ON DELETE SET NULL
);


-- =====================================================
-- 10. PRODUCTION REPORTS
-- BÁO CÁO ĐÃ DUYỆT
-- =====================================================

CREATE TABLE production_reports
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    source_temp_id INT NULL,

    worker_id INT
    NOT NULL,

    process_id INT
    NOT NULL,

    work_date DATE
    NOT NULL,

    shift VARCHAR(20)
    NOT NULL,

    machine_no VARCHAR(50),

    training_percent DECIMAL(5,2)
    NOT NULL DEFAULT 100.00,

    product_name VARCHAR(100),

    standard_output INT UNSIGNED
    NOT NULL DEFAULT 0,

    actual_output INT
    NOT NULL DEFAULT 0,

    total_time DECIMAL(8,3)
    NOT NULL DEFAULT 0,

    actual_time DECIMAL(8,3)
    NOT NULL DEFAULT 0,

    deduction_time DECIMAL(8,3)
    NOT NULL DEFAULT 0,

    tt_ok INT
    NOT NULL DEFAULT 0,

    tt_ng INT
    NOT NULL DEFAULT 0,

    stop_reason VARCHAR(255),

    note TEXT,

    status ENUM(
        'pending',
        'need_fix',
        'approved',
        'rejected'
    )
    NOT NULL DEFAULT 'approved',

    review_note TEXT,

    reviewed_by INT NULL,

    approved_at TIMESTAMP NULL,

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_report_worker
    FOREIGN KEY(worker_id)
    REFERENCES workers(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_report_process
    FOREIGN KEY(process_id)
    REFERENCES processes(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_report_reviewer
    FOREIGN KEY(reviewed_by)
    REFERENCES users(id)
    ON DELETE SET NULL
);


-- =====================================================
-- 11. TEMP DEFECTS
-- CHI TIẾT LỖI CỦA BÁO CÁO CHƯA DUYỆT
-- =====================================================

CREATE TABLE production_temp_defects
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    temp_report_id INT
    NOT NULL,

    defect_type_id INT
    NOT NULL,

    quantity INT
    NOT NULL DEFAULT 0,

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_temp_defect_report
    FOREIGN KEY(temp_report_id)
    REFERENCES production_reports_temp(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_temp_defect_type
    FOREIGN KEY(defect_type_id)
    REFERENCES defect_types(id)
    ON DELETE CASCADE,

    CONSTRAINT uq_temp_report_defect
    UNIQUE(
        temp_report_id,
        defect_type_id
    )
);


-- =====================================================
-- 12. TEMP DEDUCTIONS
-- CHI TIẾT TRỪ GIỜ CỦA BÁO CÁO CHƯA DUYỆT
-- =====================================================

CREATE TABLE production_temp_deductions
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    temp_report_id INT
    NOT NULL,

    deduction_type_id INT
    NOT NULL,

    hours DECIMAL(8,3)
    NOT NULL DEFAULT 0,

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_temp_deduction_report
    FOREIGN KEY(temp_report_id)
    REFERENCES production_reports_temp(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_temp_deduction_type
    FOREIGN KEY(deduction_type_id)
    REFERENCES deduction_types(id)
    ON DELETE CASCADE,

    CONSTRAINT uq_temp_report_deduction
    UNIQUE(
        temp_report_id,
        deduction_type_id
    )
);


-- =====================================================
-- 13. APPROVED REPORT DEFECTS
-- CHI TIẾT LỖI CỦA BÁO CÁO ĐÃ DUYỆT
-- =====================================================

CREATE TABLE production_report_defects
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    report_id INT
    NOT NULL,

    defect_type_id INT
    NOT NULL,

    quantity INT
    NOT NULL DEFAULT 0,

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_report_defect_report
    FOREIGN KEY(report_id)
    REFERENCES production_reports(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_report_defect_type
    FOREIGN KEY(defect_type_id)
    REFERENCES defect_types(id)
    ON DELETE CASCADE,

    CONSTRAINT uq_report_defect
    UNIQUE(
        report_id,
        defect_type_id
    )
);


-- =====================================================
-- 14. APPROVED REPORT DEDUCTIONS
-- CHI TIẾT TRỪ GIỜ CỦA BÁO CÁO ĐÃ DUYỆT
-- =====================================================

CREATE TABLE production_report_deductions
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    report_id INT
    NOT NULL,

    deduction_type_id INT
    NOT NULL,

    hours DECIMAL(8,3)
    NOT NULL DEFAULT 0,

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_report_deduction_report
    FOREIGN KEY(report_id)
    REFERENCES production_reports(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_report_deduction_type
    FOREIGN KEY(deduction_type_id)
    REFERENCES deduction_types(id)
    ON DELETE CASCADE,

    CONSTRAINT uq_report_deduction
    UNIQUE(
        report_id,
        deduction_type_id
    )
);


-- =====================================================
-- 15. REPORT EDIT LOGS
-- LƯU LỊCH SỬ SỬA BÁO CÁO
-- =====================================================

CREATE TABLE report_edit_logs
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    report_type ENUM(
        'temp',
        'approved'
    )
    NOT NULL,

    report_id INT
    NOT NULL,

    changed_by INT
    NOT NULL,

    field_name VARCHAR(100),

    old_value TEXT,

    new_value TEXT,

    reason TEXT,

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_report_edit_user
    FOREIGN KEY(changed_by)
    REFERENCES users(id)
    ON DELETE CASCADE
);


-- =====================================================
-- 16. WORKER TRAINING LOGS
-- LỊCH SỬ TỔ TRƯỞNG SỬA % HỌC VIỆC
-- =====================================================

CREATE TABLE worker_training_logs
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    worker_id INT
    NOT NULL,

    old_percent DECIMAL(5,2),

    new_percent DECIMAL(5,2)
    NOT NULL,

    changed_by INT
    NOT NULL,

    reason VARCHAR(255),

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_training_log_worker
    FOREIGN KEY(worker_id)
    REFERENCES workers(id)
    ON DELETE CASCADE,

    CONSTRAINT fk_training_log_user
    FOREIGN KEY(changed_by)
    REFERENCES users(id)
    ON DELETE CASCADE
);


-- =====================================================
-- 17. PROCESS DATA
-- ID PHẢI KHỚP FRONTEND processMap
-- =====================================================

INSERT INTO processes
(
    id,
    process_code,
    process_name,
    description
)
VALUES
(
    1,
    'CAT_LONG',
    'Cắt / Lồng',
    'Công đoạn Cắt và Lồng sản phẩm'
),
(
    2,
    'MAI',
    'Mài',
    'Công đoạn Mài'
),
(
    3,
    'KIEM_1',
    'Kiểm 1',
    'Kiểm tra chất lượng lần 1'
),
(
    4,
    'KIEM_2',
    'Kiểm 2',
    'Kiểm tra chất lượng lần 2'
),
(
    5,
    'EP',
    'Ép',
    'Công đoạn Ép'
),
(
    6,
    'CAN',
    'Cán',
    'Công đoạn Cán'
),
(
    7,
    'BAVIA',
    'Bavia',
    'Công đoạn Bavia'
);


-- =====================================================
-- 18. USERS
-- MẬT KHẨU MẪU: 123456
-- =====================================================

INSERT INTO users
(
    id,
    username,
    password,
    full_name,
    role
)
VALUES
(
    1,
    'admin',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Quản trị viên',
    'admin'
),
(
    2,
    'manager1',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Quản lý sản xuất',
    'manager'
),
(
    3,
    'lead1',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Tổ trưởng sản xuất',
    'lead'
),
(
    4,
    '599',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'An Thị Thanh Phương',
    'worker'
),
(
    5,
    '1246',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Nguyễn Quang Tuấn',
    'worker'
),
(
    6,
    '1333',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Hoàng Thị Thư',
    'worker'
),
(
    7,
    '1448',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Lê Thị Dung',
    'worker'
),
(
    8,
    '1476',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Đào Thị Phương',
    'worker'
),
(
    9,
    '1541',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Hoàng Quang Vinh',
    'worker'
),
(
    10,
    '1845',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Nguyễn Thị Vân',
    'worker'
),
(
    11,
    '1850',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Lê Thị Gấm',
    'worker'
),
(
    12,
    '2009',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Cao Thị Thu',
    'worker'
),
(
    13,
    '2278',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Sa Thị Ương',
    'worker'
),
(
    14,
    '2374',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Nguyễn Thị Cẩm Tiên',
    'worker'
),
(
    15,
    '2564',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Đinh Phương Thảo',
    'worker'
),
(
    16,
    '2865',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Vì Thị Thiếu',
    'worker'
),
(
    17,
    '2959',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Mùi Văn Chường',
    'worker'
),
(
    18,
    '3244',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Đinh Văn Biên',
    'worker'
),
(
    19,
    '3268',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Điêu Chính Huynh',
    'worker'
),
(
    20,
    '3277',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Vì Thị Liệu',
    'worker'
),
(
    21,
    '3295',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Đinh Thị Nhi',
    'worker'
),
(
    22,
    '3349',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Đinh Văn Bằng',
    'worker'
),
(
    23,
    '3351',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Đinh Thị Hà',
    'worker'
),
(
    24,
    '3590',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Xồng Bá Lông',
    'worker'
),
(
    25,
    '2284',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Lò Thị Mư',
    'worker'
),
(
    26,
    '655',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Giàng Thị Đông',
    'worker'
),
(
    27,
    '656',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Vừ A Nánh',
    'worker'
),
(
    28,
    '3526',
    '$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
    'Đinh Thị Tân',
    'worker'
);


-- =====================================================
-- 19. WORKERS
-- % HỌC VIỆC MẶC ĐỊNH 100
-- =====================================================

INSERT INTO workers
(
    user_id,
    worker_code,
    department,
    position,
    training_percent,
    status
)
SELECT
    id,
    username,
    'Sản xuất',
    'Công nhân',
    100.00,
    'active'
FROM users
WHERE role = 'worker';


-- =====================================================
-- 20. DỮ LIỆU % HỌC VIỆC TEST
-- CÓ THỂ XÓA HOẶC THAY ĐỔI
-- =====================================================

UPDATE workers
SET training_percent = 80.00
WHERE worker_code = '656';


UPDATE workers
SET training_percent = 90.00
WHERE worker_code = '655';


-- =====================================================
-- 21. PHÂN QUYỀN MANAGER / LEAD
-- =====================================================

INSERT INTO manager_processes
(
    manager_id,
    process_id
)
SELECT
    2,
    id
FROM processes;


INSERT INTO manager_processes
(
    manager_id,
    process_id
)
SELECT
    3,
    id
FROM processes;


-- =====================================================
-- 22. PHÂN CÔNG WORKER
-- TẠM CHO TẤT CẢ WORKER LÀM CẮT / LỒNG
-- =====================================================

INSERT INTO worker_processes
(
    worker_id,
    process_id
)
SELECT
    id,
    1
FROM workers;


-- =====================================================
-- 23. ĐỊNH MỨC CẮT
-- =====================================================

INSERT INTO product_standards
(
    process_id,
    work_type,
    product_code,
    standard_output
)
VALUES
(1, 'cat', 'c2556-2', 7200),
(1, 'cat', 'c2556-11', 6600),
(1, 'cat', 'c2556-8', 5600),
(1, 'cat', 'c2556-9', 5000),
(1, 'cat', 'C2556-auto', 5000),
(1, 'cat', 'c2821', 2400),
(1, 'cat', 'c2822', 2400),
(1, 'cat', 'c8484', 2400),
(1, 'cat', 'c8485', 2400),
(1, 'cat', 'c3880-2', 7200),
(1, 'cat', 'c0977', 1460),
(1, 'cat', 'c3880-8', 5600),
(1, 'cat', 'c3880-9', 5000),
(1, 'cat', 'c9149', 6000),
(1, 'cat', 'c0575', 1460),
(1, 'cat', 'c3438', 2600),
(1, 'cat', 'c1080', 1800);


-- =====================================================
-- 24. ĐỊNH MỨC LỒNG
-- =====================================================

INSERT INTO product_standards
(
    process_id,
    work_type,
    product_code,
    standard_output
)
VALUES
(1, 'long', '9740', 420),
(1, 'long', '2801', 605),
(1, 'long', '6262', 420),
(1, 'long', '598', 420),
(1, 'long', '7133', 605),
(1, 'long', '8484', 540),
(1, 'long', '8485', 570),
(1, 'long', '4563', 605),
(1, 'long', '3880', 400),
(1, 'long', '7960', 300),
(1, 'long', '9149', 360),
(1, 'long', '575', 300),
(1, 'long', '3438', 420),
(1, 'long', '1080', 660),
(1, 'long', '1090', 660),
(1, 'long', '1657', 90);


-- =====================================================
-- 25. LỖI NG CẮT / LỒNG
-- TÊN PHẢI KHỚP FRONTEND
-- =====================================================

INSERT INTO defect_types
(
    process_id,
    defect_code,
    defect_name,
    sort_order
)
VALUES
(1, 'KQD_DAP_LAI', 'KQD dập lại', 1),
(1, 'KQD_TUOT', 'KQD tuột', 2),
(1, 'VO_DO_LONG', 'Vỡ do lồng', 3),
(1, 'XUOC_DO_LONG', 'Xước do lồng', 4),
(1, 'CONG_GAY', 'Cong gãy', 5),
(1, 'XOAY', 'Xoay', 6),
(1, 'KHONG_DUT', 'Không đứt', 7),
(1, 'BAVIA_HUT', 'Bavia hụt', 8),
(1, 'PPCM', 'PPCM', 9),
(1, 'LOI_CAO_SU', 'Lỗi cao su', 10),
(1, 'NG_KICH_THUOC', 'NG kích thước', 11),
(1, 'CAT_LEM', 'Cắt lẹm', 12);


-- =====================================================
-- 26. TRỪ GIỜ CẮT / LỒNG
-- TÊN PHẢI KHỚP FRONTEND
-- =====================================================

INSERT INTO deduction_types
(
    process_id,
    deduction_code,
    deduction_name,
    sort_order
)
VALUES
(1, 'VSK', 'Số giờ VSK', 1),
(1, 'FIVE_S', 'Số giờ 5S + gia ca', 2),
(1, 'HAM_KHUON', 'Số giờ hâm khuôn', 3),
(1, 'SUA_KHUON', 'Số giờ sửa khuôn', 4),
(1, 'SUA_MAY', 'Số giờ sửa máy', 5),
(1, 'DUNG_MAY', 'Số giờ dừng máy', 6);


-- =====================================================
-- 27. LỖI CÁC CÔNG ĐOẠN KHÁC
-- =====================================================

INSERT INTO defect_types
(
    process_id,
    defect_code,
    defect_name,
    sort_order
)
VALUES
(2, 'ME_CANH', 'Mẻ cạnh', 1),
(2, 'XUOC', 'Xước', 2),
(2, 'LOM', 'Lõm', 3),
(2, 'SAI_KICH_THUOC', 'Sai kích thước', 4),

(3, 'NGOAI_QUAN', 'Ngoại quan', 1),
(3, 'THIEU_CHI_TIET', 'Thiếu chi tiết', 2),
(3, 'SAI_MAU', 'Sai màu', 3),

(4, 'TEM_SAI', 'Tem sai', 1),
(4, 'DONG_GOI_SAI', 'Đóng gói sai', 2),
(4, 'THUNG_LOI', 'Thùng lỗi', 3);


-- =====================================================
-- 28. TRỪ GIỜ CÁC CÔNG ĐOẠN KHÁC
-- =====================================================

INSERT INTO deduction_types
(
    process_id,
    deduction_code,
    deduction_name,
    sort_order
)
VALUES
(2, 'THAY_DA', 'Thay đá', 1),
(2, 'SUA_MAY', 'Sửa máy', 2),
(2, 'FIVE_S', '5S', 3),

(3, 'HOP', 'Họp', 1),
(3, 'DAO_TAO', 'Đào tạo', 2),

(4, 'HOP', 'Họp', 1),
(4, 'DAO_TAO', 'Đào tạo', 2);


-- =====================================================
-- 29. INDEXES
-- =====================================================

CREATE INDEX idx_users_role
ON users(role);


CREATE INDEX idx_users_status
ON users(status);


CREATE INDEX idx_workers_code
ON workers(worker_code);


CREATE INDEX idx_workers_status
ON workers(status);


CREATE INDEX idx_workers_training
ON workers(training_percent);


CREATE INDEX idx_product_standard_process
ON product_standards(process_id);


CREATE INDEX idx_product_standard_code
ON product_standards(product_code);


CREATE INDEX idx_product_standard_work_type
ON product_standards(work_type);


CREATE INDEX idx_defect_process
ON defect_types(process_id);


CREATE INDEX idx_deduction_process
ON deduction_types(process_id);


CREATE INDEX idx_temp_worker
ON production_reports_temp(worker_id);


CREATE INDEX idx_temp_process
ON production_reports_temp(process_id);


CREATE INDEX idx_temp_date
ON production_reports_temp(work_date);


CREATE INDEX idx_temp_status
ON production_reports_temp(status);


CREATE INDEX idx_report_worker
ON production_reports(worker_id);


CREATE INDEX idx_report_process
ON production_reports(process_id);


CREATE INDEX idx_report_date
ON production_reports(work_date);


CREATE INDEX idx_report_status
ON production_reports(status);


CREATE INDEX idx_temp_defect_report
ON production_temp_defects(temp_report_id);


CREATE INDEX idx_temp_deduction_report
ON production_temp_deductions(temp_report_id);


CREATE INDEX idx_report_defect_report
ON production_report_defects(report_id);


CREATE INDEX idx_report_deduction_report
ON production_report_deductions(report_id);


-- =====================================================
-- 30. VIEW FULL BÁO CÁO CHƯA DUYỆT
-- =====================================================

CREATE VIEW v_production_temp_full AS

SELECT
    pr.id,

    pr.worker_id,

    w.worker_code,

    u.full_name,

    w.department,

    w.position,

    pr.process_id,

    p.process_code,

    p.process_name,

    pr.work_date,

    pr.shift,

    pr.machine_no,

    pr.training_percent,

    pr.product_name,

    pr.standard_output,

    ROUND(
        pr.standard_output
        *
        pr.training_percent
        /
        100,
        2
    ) AS target_output,

    pr.total_time,

    pr.actual_time,

    pr.deduction_time,

    pr.actual_output,

    pr.tt_ok,

    pr.tt_ng,

    CASE
        WHEN
            pr.standard_output > 0
            AND
            pr.training_percent > 0
        THEN ROUND(
            pr.actual_output
            *
            100.0
            /
            (
                pr.standard_output
                *
                pr.training_percent
                /
                100
            ),
            2
        )
        ELSE 0
    END AS achievement_rate,

    CASE
        WHEN pr.actual_time > 0
        THEN ROUND(
            pr.actual_output
            /
            pr.actual_time,
            2
        )
        ELSE 0
    END AS products_per_hour,

    pr.stop_reason,

    pr.note,

    pr.status,

    pr.review_note,

    pr.reviewed_by,

    pr.approved_at,

    pr.created_at,

    pr.updated_at

FROM production_reports_temp pr

INNER JOIN workers w
ON pr.worker_id = w.id

INNER JOIN users u
ON w.user_id = u.id

INNER JOIN processes p
ON pr.process_id = p.id;


-- =====================================================
-- 31. VIEW FULL BÁO CÁO ĐÃ DUYỆT
-- =====================================================

CREATE VIEW v_production_report_full AS

SELECT
    pr.id,

    pr.source_temp_id,

    pr.worker_id,

    w.worker_code,

    u.full_name,

    w.department,

    w.position,

    pr.process_id,

    p.process_code,

    p.process_name,

    pr.work_date,

    pr.shift,

    pr.machine_no,

    pr.training_percent,

    pr.product_name,

    pr.standard_output,

    ROUND(
        pr.standard_output
        *
        pr.training_percent
        /
        100,
        2
    ) AS target_output,

    pr.total_time,

    pr.actual_time,

    pr.deduction_time,

    pr.actual_output,

    pr.tt_ok,

    pr.tt_ng,

    CASE
        WHEN
            pr.standard_output > 0
            AND
            pr.training_percent > 0
        THEN ROUND(
            pr.actual_output
            *
            100.0
            /
            (
                pr.standard_output
                *
                pr.training_percent
                /
                100
            ),
            2
        )
        ELSE 0
    END AS achievement_rate,

    CASE
        WHEN pr.actual_time > 0
        THEN ROUND(
            pr.actual_output
            /
            pr.actual_time,
            2
        )
        ELSE 0
    END AS products_per_hour,

    pr.stop_reason,

    pr.note,

    pr.status,

    pr.review_note,

    pr.reviewed_by,

    pr.approved_at,

    pr.created_at,

    pr.updated_at

FROM production_reports pr

INNER JOIN workers w
ON pr.worker_id = w.id

INNER JOIN users u
ON w.user_id = u.id

INNER JOIN processes p
ON pr.process_id = p.id;


-- =====================================================
-- 32. VIEW LỊCH SỬ WORKER
-- GỘP CHỜ DUYỆT VÀ ĐÃ DUYỆT
-- =====================================================

CREATE VIEW v_worker_report_history AS

SELECT
    pr.id,

    'approved' AS source,

    pr.worker_id,

    pr.process_id,

    p.process_name,

    pr.work_date,

    pr.shift,

    pr.machine_no,

    pr.training_percent,

    pr.product_name,

    pr.standard_output,

    pr.actual_output,

    pr.actual_time,

    pr.tt_ok,

    pr.tt_ng,

    pr.status,

    pr.created_at

FROM production_reports pr

INNER JOIN processes p
ON pr.process_id = p.id


UNION ALL


SELECT
    temp.id,

    'pending' AS source,

    temp.worker_id,

    temp.process_id,

    p.process_name,

    temp.work_date,

    temp.shift,

    temp.machine_no,

    temp.training_percent,

    temp.product_name,

    temp.standard_output,

    temp.actual_output,

    temp.actual_time,

    temp.tt_ok,

    temp.tt_ng,

    temp.status,

    temp.created_at

FROM production_reports_temp temp

INNER JOIN processes p
ON temp.process_id = p.id;


SET FOREIGN_KEY_CHECKS = 1;


-- =====================================================
-- 33. KIỂM TRA SAU KHI IMPORT
-- =====================================================

SELECT
    id,
    username,
    full_name,
    role,
    status
FROM users
ORDER BY id;


SELECT
    w.id AS worker_id,
    w.worker_code,
    u.full_name,
    w.department,
    w.position,
    w.training_percent,
    w.status
FROM workers w

INNER JOIN users u
ON w.user_id = u.id

ORDER BY w.id;


SELECT
    id,
    process_code,
    process_name,
    status
FROM processes
ORDER BY id;


SELECT
    work_type,
    product_code,
    standard_output
FROM product_standards
ORDER BY
    work_type,
    id;


SELECT
    id,
    process_id,
    defect_code,
    defect_name
FROM defect_types
ORDER BY
    process_id,
    sort_order;


SELECT
    id,
    process_id,
    deduction_code,
    deduction_name
FROM deduction_types
ORDER BY
    process_id,
    sort_order;


SELECT COUNT(*) AS total_users
FROM users;


SELECT COUNT(*) AS total_workers
FROM workers;


SELECT COUNT(*) AS total_product_standards
FROM product_standards;


SHOW TABLES;