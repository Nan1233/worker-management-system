DROP DATABASE IF EXISTS worker_management;

CREATE DATABASE worker_management
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE worker_management;

SET FOREIGN_KEY_CHECKS = 0;

-- =========================
-- USERS
-- =========================

CREATE TABLE users (

    id INT AUTO_INCREMENT PRIMARY KEY,

    username VARCHAR(50) NOT NULL UNIQUE,

    password VARCHAR(255) NOT NULL,

    full_name VARCHAR(100) NOT NULL,

    role ENUM('admin','manager','worker') NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- =========================
-- WORKERS
-- =========================

CREATE TABLE workers (

    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL UNIQUE,

    worker_code VARCHAR(30) NOT NULL UNIQUE,

    phone VARCHAR(20),

    department VARCHAR(100),

    position VARCHAR(100),

    status ENUM('active','inactive') DEFAULT 'active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_worker_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE

);

-- =========================
-- PROCESSES
-- =========================

CREATE TABLE processes (

    id INT AUTO_INCREMENT PRIMARY KEY,

    process_code VARCHAR(20) NOT NULL UNIQUE,

    process_name VARCHAR(100) NOT NULL,

    description TEXT,

    status ENUM('active','inactive') DEFAULT 'active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- =========================
-- USER DATA
-- Password: 123456
-- =========================

INSERT INTO users
(username,password,full_name,role)
VALUES

(
'admin',
'$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
'Administrator',
'admin'
),

(
'manager1',
'$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
'Nguyen Van Quan',
'manager'
),

(
'manager2',
'$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
'Tran Thi Hoa',
'manager'
),

(
'worker1',
'$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
'Nguyen Van A',
'worker'
),

(
'worker2',
'$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
'Le Van B',
'worker'
),

(
'worker3',
'$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
'Pham Van C',
'worker'
),

(
'worker4',
'$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
'Hoang Van D',
'worker'
),

(
'worker5',
'$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
'Tran Van E',
'worker'
);

-- =========================
-- WORKER DATA
-- =========================

INSERT INTO workers
(
user_id,
worker_code,
phone,
department,
position
)
VALUES

(4,'W001','0911111111','Production','Operator'),

(5,'W002','0922222222','Production','Operator'),

(6,'W003','0933333333','Production','Operator'),

(7,'W004','0944444444','Production','Operator'),

(8,'W005','0955555555','Production','Operator');

-- =========================
-- PROCESS DATA
-- =========================

INSERT INTO processes
(
process_code,
process_name,
description
)
VALUES

('GC','Gia công','Gia công sản phẩm'),

('CAT','Cắt','Cắt sản phẩm'),

('DG','Đóng gói','Đóng gói sản phẩm'),

('KT','Kiểm tra','Kiểm tra chất lượng'),

('LR','Lắp ráp','Lắp ráp sản phẩm');

SET FOREIGN_KEY_CHECKS = 1;

-- =========================
-- WORKER - PROCESS
-- =========================

CREATE TABLE worker_processes (

    id INT AUTO_INCREMENT PRIMARY KEY,

    worker_id INT NOT NULL,

    process_id INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_wp_worker
        FOREIGN KEY(worker_id)
        REFERENCES workers(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_wp_process
        FOREIGN KEY(process_id)
        REFERENCES processes(id)
        ON DELETE CASCADE,

    UNIQUE(worker_id,process_id)

);

INSERT INTO worker_processes
(
worker_id,
process_id
)
VALUES

(1,1),

(1,2),

(2,2),

(2,3),

(3,1),

(4,4),

(4,5),

(5,3);

-- =========================
-- MANAGER - PROCESS
-- =========================

CREATE TABLE manager_processes (

    id INT AUTO_INCREMENT PRIMARY KEY,

    manager_id INT NOT NULL,

    process_id INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_mp_manager
        FOREIGN KEY(manager_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_mp_process
        FOREIGN KEY(process_id)
        REFERENCES processes(id)
        ON DELETE CASCADE,

    UNIQUE(manager_id,process_id)

);

INSERT INTO manager_processes
(
manager_id,
process_id
)
VALUES

(2,1),

(2,2),

(2,3),

(3,4),

(3,5);

-- =========================
-- PRODUCTION REPORTS
-- =========================

CREATE TABLE production_reports (

    id INT AUTO_INCREMENT PRIMARY KEY,


    -- công nhân thực hiện
    worker_id INT NOT NULL,


    -- công đoạn
    process_id INT NOT NULL,


    -- ngày làm
    work_date DATE NOT NULL,


    -- ca làm việc
    shift ENUM(
        'Ca 1',
        'Ca 2',
        'Ca 3'
    ) NOT NULL,


    machine_no VARCHAR(50),


    -- thời gian
    total_time DECIMAL(5,2) DEFAULT 0,

    actual_time DECIMAL(5,2) DEFAULT 0,

    deduction_time DECIMAL(5,2) DEFAULT 0,


    -- sản xuất

    product_name VARCHAR(100),

    standard_output INT DEFAULT 0,

    actual_output INT DEFAULT 0,


    -- chất lượng

    tt_ok INT DEFAULT 0,

    tt_ng INT DEFAULT 0,


    kqd_dap_lai INT DEFAULT 0,

    kqd_tuot INT DEFAULT 0,


    vo_do_long INT DEFAULT 0,

    xuoc_do_long INT DEFAULT 0,

    cong_gay INT DEFAULT 0,

    xoay INT DEFAULT 0,

    khong_dut INT DEFAULT 0,

    bavia_hut INT DEFAULT 0,

    ppcm INT DEFAULT 0,

    loi_cao_su INT DEFAULT 0,

    ng_kich_thuoc INT DEFAULT 0,

    cat_lem INT DEFAULT 0,


    note TEXT,


    -- trạng thái duyệt

    status ENUM(
        'pending',
        'approved',
        'rejected'
    )
    DEFAULT 'pending',


    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,


    CONSTRAINT fk_report_worker

        FOREIGN KEY(worker_id)

        REFERENCES workers(id)

        ON DELETE CASCADE,


    CONSTRAINT fk_report_process

        FOREIGN KEY(process_id)

        REFERENCES processes(id)

        ON DELETE CASCADE

);



-- =========================
-- DỮ LIỆU TEST
-- =========================

INSERT INTO production_reports
(
worker_id,
process_id,
work_date,
shift,
machine_no,

total_time,
actual_time,
deduction_time,

product_name,

standard_output,
actual_output,

tt_ok,
tt_ng,

kqd_dap_lai,
kqd_tuot,

vo_do_long,
xuoc_do_long,

cong_gay,
xoay,

khong_dut,
bavia_hut,

ppcm,
loi_cao_su,

ng_kich_thuoc,
cat_lem,

note

)

VALUES

(
1,
1,
CURDATE(),
'Ca 1',
'M01',

8,
7.5,
0.5,

'Sản phẩm A',

1000,
980,

970,
10,

1,
0,

0,
2,

0,
0,

0,
1,

0,
0,

1,
0,

'Báo cáo test'
);


