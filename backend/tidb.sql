-- =====================================================
-- WORKER MANAGEMENT SYSTEM
-- TiDB VERSION
-- PART 1
-- =====================================================


DROP DATABASE IF EXISTS worker_management;


CREATE DATABASE worker_management
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;


USE worker_management;


SET FOREIGN_KEY_CHECKS = 0;



-- =====================================================
-- USERS
-- =====================================================

CREATE TABLE users
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    username VARCHAR(50)
    NOT NULL UNIQUE,

    password VARCHAR(255)
    NOT NULL,

    full_name VARCHAR(100)
    NOT NULL,

    role ENUM(
        'admin',
        'manager',
        'worker'
    )
    NOT NULL,

    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
);



-- =====================================================
-- WORKERS
-- =====================================================

CREATE TABLE workers
(
    id INT AUTO_INCREMENT PRIMARY KEY,


    user_id INT NOT NULL UNIQUE,


    worker_code VARCHAR(30)
    NOT NULL UNIQUE,


    phone VARCHAR(20),


    department VARCHAR(100),


    position VARCHAR(100),


    status ENUM(
        'active',
        'inactive'
    )
    DEFAULT 'active',


    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,


    FOREIGN KEY(user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);




-- =====================================================
-- PROCESSES
-- =====================================================

CREATE TABLE processes
(
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


    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
);



-- =====================================================
-- USER DATA
-- password: 123456
-- =====================================================


INSERT INTO users
(
username,
password,
full_name,
role
)

VALUES


(
'admin',
'$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
'Administrator',
'admin'
),


(
'manager1',
'$2b$10$GIwzxNuusum5.3QLsFFzKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2',
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



-- =====================================================
-- WORKERS DATA
-- =====================================================


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





-- =====================================================
-- PROCESS DATA
-- =====================================================


INSERT INTO processes
(
process_code,
process_name,
description
)

VALUES


(
'GC',
'Gia công',
'Gia công sản phẩm'
),


(
'MAI',
'Mài',
'Mài sản phẩm'
),


(
'K1',
'Kiểm 1',
'Kiểm tra lần 1'
),


(
'K2',
'Kiểm 2',
'Kiểm tra lần 2'
);



SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- WORKER MANAGEMENT SYSTEM
-- TiDB VERSION
-- PART 2
-- =====================================================


USE worker_management;



SET FOREIGN_KEY_CHECKS = 0;



-- =====================================================
-- WORKER PROCESS
-- Công nhân được phép làm công đoạn nào
-- =====================================================


CREATE TABLE worker_processes
(

    id INT AUTO_INCREMENT PRIMARY KEY,


    worker_id INT NOT NULL,


    process_id INT NOT NULL,


    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,


    FOREIGN KEY(worker_id)
    REFERENCES workers(id)
    ON DELETE CASCADE,


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
(1,3),
(1,4),

(2,1);





-- =====================================================
-- MANAGER PROCESS
-- Quản lý phụ trách công đoạn
-- =====================================================


CREATE TABLE manager_processes
(

    id INT AUTO_INCREMENT PRIMARY KEY,


    manager_id INT NOT NULL,


    process_id INT NOT NULL,


    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,


    FOREIGN KEY(manager_id)
    REFERENCES users(id)
    ON DELETE CASCADE,


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

(3,3),
(3,4);






-- =====================================================
-- DANH MỤC LỖI NG THEO CÔNG ĐOẠN
-- =====================================================


CREATE TABLE defect_types
(

    id INT AUTO_INCREMENT PRIMARY KEY,


    process_id INT NOT NULL,


    defect_code VARCHAR(50)
    NOT NULL,


    defect_name VARCHAR(100)
    NOT NULL,


    sort_order INT DEFAULT 0,


    status ENUM(
        'active',
        'inactive'
    )
    DEFAULT 'active',


    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,


    FOREIGN KEY(process_id)
    REFERENCES processes(id)
    ON DELETE CASCADE

);





-- =====================================================
-- LỖI GIA CÔNG
-- =====================================================


INSERT INTO defect_types
(
process_id,
defect_code,
defect_name,
sort_order
)

VALUES

(1,'KQD_DL','KQD dập lại',1),
(1,'KQD_TUOT','KQD tuột',2),
(1,'VO_LONG','Vỡ do lồng',3),
(1,'XUOC_LONG','Xước do lồng',4),
(1,'CONG_GAY','Cong gãy',5),
(1,'XOAY','Xoay',6),
(1,'KHONG_DUT','Không đứt',7),
(1,'BAVIA','Bavia hụt',8),
(1,'PPCM','PPCM',9),
(1,'CAO_SU','Lỗi cao su',10),
(1,'KT','NG kích thước',11),
(1,'CAT_LEM','Cắt lẹm',12);






-- =====================================================
-- LỖI MÀI
-- =====================================================


INSERT INTO defect_types
(
process_id,
defect_code,
defect_name,
sort_order
)

VALUES

(2,'ME','Mẻ cạnh',1),
(2,'XUOC','Xước',2),
(2,'LOM','Lõm',3),
(2,'SAI_KT','Sai kích thước',4);






-- =====================================================
-- LỖI KIỂM 1
-- =====================================================


INSERT INTO defect_types
(
process_id,
defect_code,
defect_name,
sort_order
)

VALUES

(3,'NGOAI_QUAN','Ngoại quan',1),
(3,'THIEU_CT','Thiếu chi tiết',2),
(3,'SAI_MAU','Sai màu',3);






-- =====================================================
-- LỖI KIỂM 2
-- =====================================================


INSERT INTO defect_types
(
process_id,
defect_code,
defect_name,
sort_order
)

VALUES

(4,'TEM','Tem sai',1),
(4,'DONG_GOI','Đóng gói sai',2),
(4,'THUNG','Thùng lỗi',3);








-- =====================================================
-- DANH MỤC TRỪ GIỜ
-- =====================================================


CREATE TABLE deduction_types
(

    id INT AUTO_INCREMENT PRIMARY KEY,


    process_id INT NOT NULL,


    deduction_code VARCHAR(50)
    NOT NULL,


    deduction_name VARCHAR(100)
    NOT NULL,


    sort_order INT DEFAULT 0,


    status ENUM(
        'active',
        'inactive'
    )
    DEFAULT 'active',


    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,


    FOREIGN KEY(process_id)
    REFERENCES processes(id)
    ON DELETE CASCADE

);






-- =====================================================
-- TRỪ GIỜ GIA CÔNG
-- =====================================================


INSERT INTO deduction_types
(
process_id,
deduction_code,
deduction_name,
sort_order
)

VALUES

(1,'VSK','Số giờ VSK',1),
(1,'5S','Số giờ 5S + Gia ca',2),
(1,'HAM_KHUON','Số giờ hâm khuôn',3),
(1,'SUA_KHUON','Số giờ sửa khuôn',4),
(1,'SUA_MAY','Số giờ sửa máy',5),
(1,'DUNG_MAY','Số giờ dừng máy',6);






-- =====================================================
-- TRỪ GIỜ MÀI
-- =====================================================


INSERT INTO deduction_types
(
process_id,
deduction_code,
deduction_name,
sort_order
)

VALUES

(2,'THAY_DA','Thay đá',1),
(2,'SUA_MAY','Sửa máy',2),
(2,'5S','5S',3);






-- =====================================================
-- TRỪ GIỜ KIỂM 1
-- =====================================================


INSERT INTO deduction_types
(
process_id,
deduction_code,
deduction_name,
sort_order
)

VALUES

(3,'HOP','Họp',1),
(3,'DAO_TAO','Đào tạo',2);






-- =====================================================
-- TRỪ GIỜ KIỂM 2
-- =====================================================


INSERT INTO deduction_types
(
process_id,
deduction_code,
deduction_name,
sort_order
)

VALUES

(4,'HOP','Họp',1),
(4,'DAO_TAO','Đào tạo',2);



SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- WORKER MANAGEMENT SYSTEM
-- TiDB VERSION
-- PART 3
-- Production Reports
-- Report Defects
-- Report Deductions
-- =====================================================


USE worker_management;


SET FOREIGN_KEY_CHECKS = 0;



-- =====================================================
-- BẢNG BÁO CÁO SẢN XUẤT
-- =====================================================


CREATE TABLE production_reports
(

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


    product_name VARCHAR(100),



    -- ==========================
    -- THỜI GIAN
    -- ==========================

    total_time DECIMAL(5,2)
    DEFAULT 0,


    actual_time DECIMAL(5,2)
    DEFAULT 0,


    deduction_time DECIMAL(5,2)
    DEFAULT 0,



    -- ==========================
    -- SẢN LƯỢNG
    -- ==========================

    standard_output INT
    DEFAULT 0,


    actual_output INT
    DEFAULT 0,



    -- ==========================
    -- CHẤT LƯỢNG
    -- ==========================

    tt_ok INT
    DEFAULT 0,


    tt_ng INT
    DEFAULT 0,



    note TEXT,



    -- ==========================
    -- DUYỆT
    -- ==========================

    status ENUM(
        'pending',
        'need_fix',
        'approved',
        'rejected'
    )
    DEFAULT 'pending',



    review_note TEXT,


    reviewed_by INT NULL,


    approved_at TIMESTAMP NULL,



    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,


    updated_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
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







-- =====================================================
-- CHI TIẾT LỖI NG
-- =====================================================


CREATE TABLE production_report_defects
(

    id INT AUTO_INCREMENT PRIMARY KEY,


    report_id INT NOT NULL,


    defect_type_id INT NOT NULL,


    quantity INT DEFAULT 0,


    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,



    FOREIGN KEY(report_id)
    REFERENCES production_reports(id)
    ON DELETE CASCADE,



    FOREIGN KEY(defect_type_id)
    REFERENCES defect_types(id)
    ON DELETE CASCADE

);








-- =====================================================
-- CHI TIẾT TRỪ GIỜ
-- =====================================================


CREATE TABLE production_report_deductions
(

    id INT AUTO_INCREMENT PRIMARY KEY,


    report_id INT NOT NULL,


    deduction_type_id INT NOT NULL,


    hours DECIMAL(5,2)
    DEFAULT 0,


    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,



    FOREIGN KEY(report_id)
    REFERENCES production_reports(id)
    ON DELETE CASCADE,



    FOREIGN KEY(deduction_type_id)
    REFERENCES deduction_types(id)
    ON DELETE CASCADE

);






-- =====================================================
-- INDEX CƠ BẢN
-- =====================================================


CREATE INDEX idx_report_worker

ON production_reports(worker_id);



CREATE INDEX idx_report_process

ON production_reports(process_id);



CREATE INDEX idx_report_date

ON production_reports(work_date);



CREATE INDEX idx_defect_report

ON production_report_defects(report_id);



CREATE INDEX idx_deduction_report

ON production_report_deductions(report_id);



SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- WORKER MANAGEMENT SYSTEM
-- TiDB VERSION
-- PART 4
-- Temp Reports
-- Temp Defects
-- Temp Deductions
-- View
-- =====================================================


USE worker_management;


SET FOREIGN_KEY_CHECKS = 0;



-- =====================================================
-- BẢNG BÁO CÁO TẠM CHỜ DUYỆT
-- =====================================================


CREATE TABLE production_reports_temp
(

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


    product_name VARCHAR(100),



    -- ======================
    -- THỜI GIAN
    -- ======================

    total_time DECIMAL(5,2)
    DEFAULT 0,


    actual_time DECIMAL(5,2)
    DEFAULT 0,


    deduction_time DECIMAL(5,2)
    DEFAULT 0,



    -- ======================
    -- SẢN LƯỢNG
    -- ======================

    standard_output INT
    DEFAULT 0,


    actual_output INT
    DEFAULT 0,



    -- ======================
    -- CHẤT LƯỢNG
    -- ======================

    tt_ok INT
    DEFAULT 0,


    tt_ng INT
    DEFAULT 0,



    note TEXT,



    -- ======================
    -- DUYỆT
    -- ======================

    status ENUM(
        'pending',
        'need_fix',
        'approved',
        'rejected'
    )
    DEFAULT 'pending',



    review_note TEXT,


    reviewed_by INT NULL,


    approved_at TIMESTAMP NULL,



    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,


    updated_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP
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








-- =====================================================
-- LỖI NG TEMP
-- =====================================================


CREATE TABLE production_temp_defects
(

    id INT AUTO_INCREMENT PRIMARY KEY,


    temp_report_id INT NOT NULL,


    defect_type_id INT NOT NULL,


    quantity INT DEFAULT 0,


    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,



    FOREIGN KEY(temp_report_id)
    REFERENCES production_reports_temp(id)
    ON DELETE CASCADE,



    FOREIGN KEY(defect_type_id)
    REFERENCES defect_types(id)
    ON DELETE CASCADE

);








-- =====================================================
-- TRỪ GIỜ TEMP
-- =====================================================


CREATE TABLE production_temp_deductions
(

    id INT AUTO_INCREMENT PRIMARY KEY,


    temp_report_id INT NOT NULL,


    deduction_type_id INT NOT NULL,


    hours DECIMAL(5,2)
    DEFAULT 0,


    created_at TIMESTAMP
    DEFAULT CURRENT_TIMESTAMP,



    FOREIGN KEY(temp_report_id)
    REFERENCES production_reports_temp(id)
    ON DELETE CASCADE,



    FOREIGN KEY(deduction_type_id)
    REFERENCES deduction_types(id)
    ON DELETE CASCADE

);








-- =====================================================
-- VIEW LỊCH SỬ BÁO CÁO
-- =====================================================


CREATE VIEW v_production_history AS


SELECT


    pr.id,


    w.worker_code,


    u.full_name,


    p.process_name,


    pr.work_date,


    pr.shift,


    pr.machine_no,


    pr.product_name,


    pr.total_time,


    pr.actual_time,


    pr.deduction_time,


    pr.standard_output,


    pr.actual_output,


    pr.tt_ok,


    pr.tt_ng,


    pr.status,


    pr.created_at



FROM production_reports pr



JOIN workers w

ON pr.worker_id = w.id



JOIN users u

ON w.user_id = u.id



JOIN processes p

ON pr.process_id = p.id;



SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================
-- WORKER MANAGEMENT SYSTEM
-- TiDB VERSION
-- PART 5
-- TEST DATA
-- =====================================================


USE worker_management;



-- =====================================================
-- TEST BÁO CÁO GIA CÔNG
-- process_id = 1
-- =====================================================


INSERT INTO production_reports
(
worker_id,
process_id,
work_date,
shift,
machine_no,
product_name,

total_time,
actual_time,

standard_output,
actual_output,

tt_ok,

note
)

VALUES

(
1,
1,
'2026-07-14',
'Ca 1',

'GC-01',

'SP-A100',

8,
7.5,

1000,
950,

930,

'Báo cáo gia công test'
);



-- =====================================================
-- LỖI NG GIA CÔNG
-- report_id = 1
-- =====================================================


INSERT INTO production_report_defects
(
report_id,
defect_type_id,
quantity
)

VALUES

(1,1,5),

(1,3,2),

(1,8,3);




-- =====================================================
-- TRỪ GIỜ GIA CÔNG
-- =====================================================


INSERT INTO production_report_deductions
(
report_id,
deduction_type_id,
hours
)

VALUES

(1,5,1),

(1,2,0.5);







-- =====================================================
-- TEST BÁO CÁO MÀI
-- process_id = 2
-- =====================================================


INSERT INTO production_reports
(
worker_id,
process_id,
work_date,
shift,
machine_no,
product_name,

total_time,
actual_time,

standard_output,
actual_output,

tt_ok,

note
)

VALUES

(
1,
2,
'2026-07-14',
'Ca 2',

'MAI-01',

'SP-MAI',

8,
8,

800,
780,

770,

'Báo cáo mài test'
);




-- LỖI MÀI

INSERT INTO production_report_defects
(
report_id,
defect_type_id,
quantity
)

VALUES

(2,13,5),

(2,14,5);




-- TRỪ GIỜ MÀI

INSERT INTO production_report_deductions
(
report_id,
deduction_type_id,
hours
)

VALUES

(2,7,0.5);







-- =====================================================
-- TEST KIỂM 1
-- process_id = 3
-- =====================================================


INSERT INTO production_reports
(
worker_id,
process_id,
work_date,
shift,
machine_no,
product_name,

total_time,
actual_time,

standard_output,
actual_output,

tt_ok,

note
)

VALUES

(
1,
3,
'2026-07-14',
'Ca 1',

'KT1-01',

'SP-KT1',

8,
8,

1000,
995,

990,

'Kiểm tra lần 1'
);





INSERT INTO production_report_defects
(
report_id,
defect_type_id,
quantity
)

VALUES

(3,17,3),

(3,18,2);







-- =====================================================
-- TEST KIỂM 2
-- process_id = 4
-- =====================================================


INSERT INTO production_reports
(
worker_id,
process_id,
work_date,
shift,
machine_no,
product_name,

total_time,
actual_time,

standard_output,
actual_output,

tt_ok,

note
)

VALUES

(
2,
4,
'2026-07-14',
'Ca 3',

'KT2-01',

'SP-KT2',

8,
7.5,

500,
490,

485,

'Kiểm tra lần 2'
);





INSERT INTO production_report_defects
(
report_id,
defect_type_id,
quantity
)

VALUES

(4,20,3);







-- =====================================================
-- KIỂM TRA
-- =====================================================


SELECT *

FROM production_reports;



SELECT *

FROM production_report_defects;



SELECT *

FROM production_report_deductions;


-- =====================================================
-- WORKER MANAGEMENT SYSTEM
-- TiDB VERSION
-- PART 6
-- INDEX + API QUERY
-- =====================================================


USE worker_management;



-- =====================================================
-- INDEX TỐI ƯU
-- =====================================================


CREATE INDEX idx_report_status
ON production_reports(status);



CREATE INDEX idx_temp_worker
ON production_reports_temp(worker_id);



CREATE INDEX idx_temp_status
ON production_reports_temp(status);



CREATE INDEX idx_defect_process
ON defect_types(process_id);



CREATE INDEX idx_deduction_process
ON deduction_types(process_id);






-- =====================================================
-- API 1
-- CÔNG NHÂN XEM LỊCH SỬ CỦA MÌNH
--
-- GET /api/reports/my
-- =====================================================


SELECT

pr.id,

p.process_name,

pr.work_date,

pr.shift,

pr.machine_no,

pr.product_name,

pr.standard_output,

pr.actual_output,

pr.tt_ok,

pr.tt_ng,

pr.status,

pr.created_at


FROM production_reports pr



JOIN processes p

ON pr.process_id = p.id



WHERE pr.worker_id = 1



ORDER BY pr.created_at DESC;







-- =====================================================
-- API 2
-- QUẢN LÝ XEM BÁO CÁO CHỜ DUYỆT
--
-- GET /api/manager/reports/pending
-- =====================================================


SELECT

pr.id,

w.worker_code,

u.full_name,

p.process_name,

pr.work_date,

pr.shift,

pr.machine_no,

pr.product_name,

pr.tt_ok,

pr.tt_ng,

pr.status,

pr.created_at


FROM production_reports pr



JOIN workers w

ON pr.worker_id = w.id



JOIN users u

ON w.user_id = u.id



JOIN processes p

ON pr.process_id = p.id



WHERE pr.status='pending'


ORDER BY pr.created_at ASC;








-- =====================================================
-- API 3
-- LẤY CHI TIẾT BÁO CÁO
--
-- GET /api/reports/:id
-- =====================================================


SELECT


pr.*,


w.worker_code,


u.full_name,


p.process_name



FROM production_reports pr



JOIN workers w

ON pr.worker_id=w.id



JOIN users u

ON w.user_id=u.id



JOIN processes p

ON pr.process_id=p.id



WHERE pr.id=1;







-- =====================================================
-- API 4
-- LẤY LỖI THEO CÔNG ĐOẠN
--
-- GET /api/processes/:id/defects
-- =====================================================


SELECT

id,

defect_code,

defect_name


FROM defect_types


WHERE process_id = 1


AND status='active'


ORDER BY sort_order;







-- =====================================================
-- API 5
-- LẤY TRỪ GIỜ THEO CÔNG ĐOẠN
--
-- GET /api/processes/:id/deductions
-- =====================================================


SELECT

id,

deduction_code,

deduction_name


FROM deduction_types


WHERE process_id = 1


AND status='active'


ORDER BY sort_order;







-- =====================================================
-- API 6
-- CHI TIẾT LỖI NG CỦA BÁO CÁO
-- =====================================================


SELECT


d.defect_name,


r.quantity



FROM production_report_defects r



JOIN defect_types d

ON r.defect_type_id=d.id



WHERE r.report_id=1;







-- =====================================================
-- API 7
-- CHI TIẾT TRỪ GIỜ CỦA BÁO CÁO
-- =====================================================


SELECT


d.deduction_name,


r.hours



FROM production_report_deductions r



JOIN deduction_types d

ON r.deduction_type_id=d.id



WHERE r.report_id=1;







-- =====================================================
-- API EXPORT EXCEL
-- =====================================================


SELECT


w.worker_code AS MaNV,


u.full_name AS HoTen,


p.process_name AS CongDoan,


pr.work_date AS Ngay,


pr.shift AS Ca,


pr.machine_no AS May,


pr.product_name AS SanPham,


pr.total_time AS TongTG,


pr.actual_time AS TGThucTe,


pr.deduction_time AS TGTru,


pr.standard_output AS DinhMuc,


pr.actual_output AS ThucTe,


pr.tt_ok AS OK,


pr.tt_ng AS NG,


pr.status AS TrangThai



FROM production_reports pr



JOIN workers w

ON pr.worker_id=w.id



JOIN users u

ON w.user_id=u.id



JOIN processes p

ON pr.process_id=p.id;



-- =====================================================
-- KIỂM TRA CUỐI
-- =====================================================


SELECT COUNT(*) AS total_report
FROM production_reports;


SELECT COUNT(*) AS total_defect
FROM production_report_defects;


SELECT COUNT(*) AS total_deduction
FROM production_report_deductions;


SHOW TABLES;


USE worker_management;

SHOW TABLES;


SELECT * FROM users;

SELECT * FROM workers;

SELECT * FROM processes;

SELECT username, LENGTH(password)
FROM users;

UPDATE users
SET password =
'$2b$10$GIwzxNuusum5.3QLsFFKzOujVcYAPyGtVu/Z/fBsDzNTovBicGJd2'
WHERE username='manager1';