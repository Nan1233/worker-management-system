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

    role ENUM(
        'admin',
        'manager',
        'worker'
    ) NOT NULL,

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

    status ENUM(
        'active',
        'inactive'
    )
    DEFAULT 'active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,


    FOREIGN KEY(user_id)
    REFERENCES users(id)
    ON DELETE CASCADE

);



-- =========================
-- PROCESSES
-- =========================

CREATE TABLE processes (

    id INT AUTO_INCREMENT PRIMARY KEY,

    process_code VARCHAR(20)
    UNIQUE NOT NULL,

    process_name VARCHAR(100)
    NOT NULL,

    description TEXT,

    status ENUM(
        'active',
        'inactive'
    )
    DEFAULT 'active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);



-- =========================
-- USERS DATA
-- password: 123456
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
);



-- =========================
-- WORKERS DATA
-- =========================


INSERT INTO workers
(
user_id,
worker_code,
department,
position
)

VALUES

(4,'W001','Production','Operator'),

(5,'W002','Production','Operator');




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

('DG','Đóng gói','Đóng gói'),

('KT','Kiểm tra','Kiểm tra chất lượng'),

('LR','Lắp ráp','Lắp ráp');





-- =========================
-- WORKER PROCESS
-- =========================

CREATE TABLE worker_processes(

id INT AUTO_INCREMENT PRIMARY KEY,

worker_id INT NOT NULL,

process_id INT NOT NULL,


FOREIGN KEY(worker_id)
REFERENCES workers(id)
ON DELETE CASCADE,


FOREIGN KEY(process_id)
REFERENCES processes(id)
ON DELETE CASCADE,


UNIQUE(worker_id,process_id)

);



INSERT INTO worker_processes VALUES

(NULL,1,1),
(NULL,1,2),
(NULL,2,3);




-- =========================
-- MANAGER PROCESS
-- =========================

CREATE TABLE manager_processes(

id INT AUTO_INCREMENT PRIMARY KEY,

manager_id INT NOT NULL,

process_id INT NOT NULL,


FOREIGN KEY(manager_id)
REFERENCES users(id)
ON DELETE CASCADE,


FOREIGN KEY(process_id)
REFERENCES processes(id)
ON DELETE CASCADE,


UNIQUE(manager_id,process_id)

);



INSERT INTO manager_processes VALUES

(NULL,2,1),
(NULL,2,2),
(NULL,3,3);




-- =====================================================
-- DỮ LIỆU CHÍNH
-- =====================================================


CREATE TABLE production_reports (

id INT AUTO_INCREMENT PRIMARY KEY,


worker_id INT NOT NULL,


process_id INT NOT NULL,


work_date DATE NOT NULL,


shift ENUM(
'Ca 1',
'Ca 2',
'Ca 3'
)
NOT NULL,


machine_no VARCHAR(50),



total_time DECIMAL(5,2) DEFAULT 0,

actual_time DECIMAL(5,2) DEFAULT 0,

deduction_time DECIMAL(5,2) DEFAULT 0,



product_name VARCHAR(100),


standard_output INT DEFAULT 0,

actual_output INT DEFAULT 0,



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



created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,


updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,



FOREIGN KEY(worker_id)
REFERENCES workers(id),


FOREIGN KEY(process_id)
REFERENCES processes(id)

);






-- =====================================================
-- DỮ LIỆU TẠM CHỜ DUYỆT
-- =====================================================


CREATE TABLE production_reports_temp (

id INT AUTO_INCREMENT PRIMARY KEY,


worker_id INT NOT NULL,


process_id INT NOT NULL,


work_date DATE NOT NULL,


shift ENUM(
'Ca 1',
'Ca 2',
'Ca 3'
)
NOT NULL,


machine_no VARCHAR(50),



total_time DECIMAL(5,2) DEFAULT 0,

actual_time DECIMAL(5,2) DEFAULT 0,

deduction_time DECIMAL(5,2) DEFAULT 0,



product_name VARCHAR(100),


standard_output INT DEFAULT 0,

actual_output INT DEFAULT 0,



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



review_note TEXT,


reviewed_by INT NULL,



status ENUM(
'pending',
'need_fix',
'approved',
'rejected'
)
DEFAULT 'pending',



created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,


updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
ON UPDATE CURRENT_TIMESTAMP,



FOREIGN KEY(worker_id)
REFERENCES workers(id)
ON DELETE CASCADE,


FOREIGN KEY(process_id)
REFERENCES processes(id)
ON DELETE CASCADE,


FOREIGN KEY(reviewed_by)
REFERENCES users(id)

);





SET FOREIGN_KEY_CHECKS = 1;



-- TEST LOGIN

SELECT username,role FROM users;