-- =====================================================
-- WORKER MANAGEMENT SYSTEM V2
-- PART 1
-- Database + Users + Workers + Processes
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

    username VARCHAR(50) NOT NULL UNIQUE,

    password VARCHAR(255) NOT NULL,

    full_name VARCHAR(100) NOT NULL,

    role ENUM
    (
        'admin',
        'manager',
        'worker'
    ) NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- WORKERS
-- =====================================================

CREATE TABLE workers
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    user_id INT NOT NULL UNIQUE,

    worker_code VARCHAR(30) UNIQUE NOT NULL,

    phone VARCHAR(20),

    department VARCHAR(100),

    position VARCHAR(100),

    status ENUM
    (
        'active',
        'inactive'
    )
    DEFAULT 'active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

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

    process_code VARCHAR(20) UNIQUE NOT NULL,

    process_name VARCHAR(100) NOT NULL,

    description TEXT,

    status ENUM
    (
        'active',
        'inactive'
    )
    DEFAULT 'active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- USERS DATA
-- password = 123456
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

('GC','Gia công','Gia công'),

('MAI','Mài','Mài'),

('K1','Kiểm 1','Kiểm lần 1'),

('K2','Kiểm 2','Kiểm lần 2');

-- =====================================================
-- PART 2
-- Worker Process
-- Manager Process
-- Defect Types
-- Deduction Types
-- =====================================================

-- =====================================================
-- WORKER PROCESS
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
(worker_id,process_id)

VALUES

(1,1),
(1,2),
(1,3),
(1,4),

(2,1);





-- =====================================================
-- MANAGER PROCESS
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
(manager_id,process_id)

VALUES

(2,1),
(2,2),

(3,3),
(3,4);





-- =====================================================
-- DANH MỤC LỖI
-- =====================================================

CREATE TABLE defect_types
(
    id INT AUTO_INCREMENT PRIMARY KEY,

    process_id INT NOT NULL,

    defect_code VARCHAR(50) NOT NULL,

    defect_name VARCHAR(100) NOT NULL,

    sort_order INT DEFAULT 0,

    status ENUM
    (
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
-- GIA CÔNG
-- =====================================================

INSERT INTO defect_types
(process_id,defect_code,defect_name,sort_order)

VALUES

(1,'KQD_DL','KQD dập lại',1),

(1,'KQD_TUOT','KQD tuốt',2),

(1,'VO_LONG','Vỡ do lồng',3),

(1,'XUOC_LONG','Xước do lồng',4),

(1,'CONG_GAY','Cong gãy',5),

(1,'XOAY','Xoay',6),

(1,'KHONG_DUT','Không đứt',7),

(1,'BAVIA','Bavia đút hụt',8),

(1,'PPCM','PPCM',9),

(1,'CAO_SU','Lỗi cao su',10),

(1,'KT','NG kích thước',11),

(1,'CAT_LEM','Cắt lẹm',12);





-- =====================================================
-- MÀI
-- =====================================================

INSERT INTO defect_types
(process_id,defect_code,defect_name,sort_order)

VALUES

(2,'ME','Mẻ cạnh',1),

(2,'XUOC','Xước',2),

(2,'LOM','Lõm',3),

(2,'SAI_KT','Sai kích thước',4);





-- =====================================================
-- KIỂM 1
-- =====================================================

INSERT INTO defect_types
(process_id,defect_code,defect_name,sort_order)

VALUES

(3,'NGOAI_QUAN','Ngoại quan',1),

(3,'THIEU_CT','Thiếu chi tiết',2),

(3,'SAI_MAU','Sai màu',3);





-- =====================================================
-- KIỂM 2
-- =====================================================

INSERT INTO defect_types
(process_id,defect_code,defect_name,sort_order)

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

    deduction_code VARCHAR(50) NOT NULL,

    deduction_name VARCHAR(100) NOT NULL,

    sort_order INT DEFAULT 0,

    status ENUM
    (
        'active',
        'inactive'
    )
    DEFAULT 'active',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY(process_id)
        REFERENCES processes(id)
        ON DELETE CASCADE
);





INSERT INTO deduction_types
(process_id,deduction_code,deduction_name,sort_order)

VALUES

(1,'VSK','Số giờ VSK',1),

(1,'5S','Số giờ 5S + Gia ca',2),

(1,'HAM_KHUON','Số giờ hâm khuôn',3),

(1,'SUA_KHUON','Số giờ sửa khuôn',4),

(1,'SUA_MAY','Số giờ sửa máy',5),

(1,'DUNG_MAY','Số giờ dừng máy',6);





INSERT INTO deduction_types
(process_id,deduction_code,deduction_name,sort_order)

VALUES

(2,'THAY_DA','Thay đá',1),

(2,'SUA_MAY','Sửa máy',2),

(2,'5S','5S',3);





INSERT INTO deduction_types
(process_id,deduction_code,deduction_name,sort_order)

VALUES

(3,'HOP','Họp',1),

(3,'DAO_TAO','Đào tạo',2);





INSERT INTO deduction_types
(process_id,deduction_code,deduction_name,sort_order)

VALUES

(4,'HOP','Họp',1),

(4,'DAO_TAO','Đào tạo',2);

-- =====================================================
-- PART 3
-- Production Reports
-- Report Defects
-- Report Deductions
-- =====================================================


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
    ) NOT NULL,


    machine_no VARCHAR(50),


    product_name VARCHAR(100),


    total_time DECIMAL(5,2)
    DEFAULT 0,


    actual_time DECIMAL(5,2)
    DEFAULT 0,


    deduction_time DECIMAL(5,2)
    DEFAULT 0,


    standard_output INT
    DEFAULT 0,


    actual_output INT
    DEFAULT 0,


    tt_ok INT
    DEFAULT 0,


    tt_ng INT
    DEFAULT 0,


    note TEXT,


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



-- =====================================================
-- CHI TIẾT THỜI GIAN TRỪ
-- =====================================================


CREATE TABLE production_report_deductions
(

    id INT AUTO_INCREMENT PRIMARY KEY,


    report_id INT NOT NULL,


    deduction_type_id INT NOT NULL,


    hours DECIMAL(5,2)
    DEFAULT 1,


    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,


    FOREIGN KEY(report_id)
        REFERENCES production_reports(id)
        ON DELETE CASCADE,


    FOREIGN KEY(deduction_type_id)
        REFERENCES deduction_types(id)
        ON DELETE CASCADE

);



-- =====================================================
-- CHI TIẾT LỖI NG
-- =====================================================


CREATE TABLE production_report_defects
(

    id INT AUTO_INCREMENT PRIMARY KEY,


    report_id INT NOT NULL,


    defect_type_id INT NOT NULL,


    quantity INT
    DEFAULT 1,


    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,


    FOREIGN KEY(report_id)
        REFERENCES production_reports(id)
        ON DELETE CASCADE,


    FOREIGN KEY(defect_type_id)
        REFERENCES defect_types(id)
        ON DELETE CASCADE

);-- =====================================================
-- PART 4
-- Temp Report
-- Trigger
-- View
-- Index
-- =====================================================



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
    ) NOT NULL,


    machine_no VARCHAR(50),


    product_name VARCHAR(100),


    total_time DECIMAL(5,2)
    DEFAULT 0,


    actual_time DECIMAL(5,2)
    DEFAULT 0,


    deduction_time DECIMAL(5,2)
    DEFAULT 0,


    standard_output INT
    DEFAULT 0,


    actual_output INT
    DEFAULT 0,


    tt_ok INT
    DEFAULT 0,


    tt_ng INT
    DEFAULT 0,


    note TEXT,


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





-- =====================================================
-- CHI TIẾT TRỪ GIỜ TEMP
-- =====================================================


CREATE TABLE production_temp_deductions
(

    id INT AUTO_INCREMENT PRIMARY KEY,


    temp_report_id INT NOT NULL,


    deduction_type_id INT NOT NULL,


    hours DECIMAL(5,2)
    DEFAULT 1,


    FOREIGN KEY(temp_report_id)
        REFERENCES production_reports_temp(id)
        ON DELETE CASCADE,


    FOREIGN KEY(deduction_type_id)
        REFERENCES deduction_types(id)
        ON DELETE CASCADE

);





-- =====================================================
-- CHI TIẾT LỖI NG TEMP
-- =====================================================


CREATE TABLE production_temp_defects
(

    id INT AUTO_INCREMENT PRIMARY KEY,


    temp_report_id INT NOT NULL,


    defect_type_id INT NOT NULL,


    quantity INT DEFAULT 1,


    FOREIGN KEY(temp_report_id)
        REFERENCES production_reports_temp(id)
        ON DELETE CASCADE,


    FOREIGN KEY(defect_type_id)
        REFERENCES defect_types(id)
        ON DELETE CASCADE

);





-- =====================================================
-- TRIGGER TÍNH TỔNG GIỜ TRỪ
-- =====================================================

DELIMITER $$


CREATE TRIGGER update_deduction_time


AFTER INSERT ON production_report_deductions


FOR EACH ROW

BEGIN


UPDATE production_reports


SET deduction_time =

(

SELECT IFNULL(
SUM(hours),
0
)

FROM production_report_deductions

WHERE report_id = NEW.report_id

)


WHERE id = NEW.report_id;


END$$



DELIMITER ;






-- =====================================================
-- TRIGGER TÍNH TỔNG NG
-- =====================================================


DELIMITER $$


CREATE TRIGGER update_tt_ng


AFTER INSERT ON production_report_defects


FOR EACH ROW

BEGIN


UPDATE production_reports


SET tt_ng =

(

SELECT IFNULL(
SUM(quantity),
0
)

FROM production_report_defects

WHERE report_id = NEW.report_id

)


WHERE id = NEW.report_id;


END$$



DELIMITER ;





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


pr.standard_output,


pr.actual_output,


pr.tt_ok,


pr.tt_ng,


pr.deduction_time,


pr.status,


pr.created_at


FROM production_reports pr



JOIN workers w

ON pr.worker_id = w.id



JOIN users u

ON w.user_id = u.id



JOIN processes p

ON pr.process_id = p.id;





-- =====================================================
-- INDEX TỐI ƯU
-- =====================================================


CREATE INDEX idx_report_worker

ON production_reports(worker_id);



CREATE INDEX idx_report_process

ON production_reports(process_id);



CREATE INDEX idx_report_date

ON production_reports(work_date);



CREATE INDEX idx_defect_process

ON defect_types(process_id);



CREATE INDEX idx_deduction_process

ON deduction_types(process_id);



SET FOREIGN_KEY_CHECKS = 1;


-- =====================================================
-- PART 5
-- FULL TRIGGER
-- TEST DATA
-- =====================================================


DELIMITER $$



-- =====================================================
-- DEDUCTION INSERT
-- =====================================================


CREATE TRIGGER trg_deduction_insert

AFTER INSERT ON production_report_deductions

FOR EACH ROW

BEGIN


UPDATE production_reports


SET deduction_time =

(

SELECT IFNULL(
SUM(hours),
0
)

FROM production_report_deductions

WHERE report_id = NEW.report_id

)


WHERE id = NEW.report_id;


END$$





-- =====================================================
-- DEDUCTION UPDATE
-- =====================================================


CREATE TRIGGER trg_deduction_update

AFTER UPDATE ON production_report_deductions

FOR EACH ROW

BEGIN


UPDATE production_reports


SET deduction_time =

(

SELECT IFNULL(
SUM(hours),
0
)

FROM production_report_deductions

WHERE report_id = NEW.report_id

)


WHERE id = NEW.report_id;


END$$





-- =====================================================
-- DEDUCTION DELETE
-- =====================================================


CREATE TRIGGER trg_deduction_delete

AFTER DELETE ON production_report_deductions

FOR EACH ROW

BEGIN


UPDATE production_reports


SET deduction_time =

(

SELECT IFNULL(
SUM(hours),
0
)

FROM production_report_deductions

WHERE report_id = OLD.report_id

)


WHERE id = OLD.report_id;


END$$







-- =====================================================
-- DEFECT INSERT
-- =====================================================


CREATE TRIGGER trg_defect_insert

AFTER INSERT ON production_report_defects

FOR EACH ROW

BEGIN


UPDATE production_reports


SET tt_ng =

(

SELECT IFNULL(
SUM(quantity),
0
)

FROM production_report_defects

WHERE report_id = NEW.report_id

)


WHERE id = NEW.report_id;


END$$






-- =====================================================
-- DEFECT UPDATE
-- =====================================================


CREATE TRIGGER trg_defect_update

AFTER UPDATE ON production_report_defects

FOR EACH ROW

BEGIN


UPDATE production_reports


SET tt_ng =

(

SELECT IFNULL(
SUM(quantity),
0
)

FROM production_report_defects

WHERE report_id = NEW.report_id

)


WHERE id = NEW.report_id;


END$$





-- =====================================================
-- DEFECT DELETE
-- =====================================================


CREATE TRIGGER trg_defect_delete

AFTER DELETE ON production_report_defects

FOR EACH ROW

BEGIN


UPDATE production_reports


SET tt_ng =

(

SELECT IFNULL(
SUM(quantity),
0
)

FROM production_report_defects

WHERE report_id = OLD.report_id

)


WHERE id = OLD.report_id;


END$$



DELIMITER ;





-- =====================================================
-- TEST REPORT
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
'Test báo cáo gia công'
);





-- =====================================================
-- TEST TRỪ GIỜ
-- report_id = 1
-- =====================================================


INSERT INTO production_report_deductions
(
report_id,
deduction_type_id,
hours
)

VALUES

(
1,
5,
1
),

(
1,
2,
0.5
);





-- =====================================================
-- TEST NG
-- =====================================================


INSERT INTO production_report_defects
(
report_id,
defect_type_id,
quantity
)

VALUES


(
1,
1,
5
),


(
1,
3,
2
),


(
1,
8,
3
);





-- =====================================================
-- KIỂM TRA
-- =====================================================


SELECT *

FROM production_reports;



SELECT *

FROM production_report_deductions;



SELECT *

FROM production_report_defects;

-- =====================================================
-- PART 6
-- SAMPLE DATA
-- QUERY TEST API
-- =====================================================



-- =====================================================
-- TEST BÁO CÁO MÀI
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
'SP-MAI-01',
8,
8,
800,
780,
770,
'Báo cáo công đoạn mài'
);





-- TRỪ GIỜ MÀI

INSERT INTO production_report_deductions
(
report_id,
deduction_type_id,
hours
)

VALUES

(
2,
7,
0.5
);





-- NG MÀI

INSERT INTO production_report_defects
(
report_id,
defect_type_id,
quantity
)

VALUES

(
2,
13,
3
),

(
2,
14,
2
);







-- =====================================================
-- TEST KIỂM 1
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
'SP-KT-01',
8,
8,
1000,
1000,
995,
'Kiểm tra lần 1'
);





INSERT INTO production_report_defects
(
report_id,
defect_type_id,
quantity
)

VALUES

(
3,
17,
3
),

(
3,
18,
2
);







-- =====================================================
-- TEST KIỂM 2
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
'SP-KT-02',
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

(
4,
20,
3
);







-- =====================================================
-- QUERY 1
-- LẤY LỖI THEO CÔNG ĐOẠN
-- API:
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
-- QUERY 2
-- LẤY TRỪ GIỜ THEO CÔNG ĐOẠN
-- API:
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
-- QUERY 3
-- CHI TIẾT BÁO CÁO
-- =====================================================


SELECT


pr.id,

u.full_name,

w.worker_code,

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


pr.note


FROM production_reports pr



JOIN workers w

ON pr.worker_id=w.id



JOIN users u

ON w.user_id=u.id



JOIN processes p

ON pr.process_id=p.id



WHERE pr.id=1;







-- =====================================================
-- QUERY 4
-- LẤY CHI TIẾT LỖI
-- =====================================================


SELECT


d.defect_name,

rd.quantity


FROM production_report_defects rd



JOIN defect_types d

ON rd.defect_type_id=d.id



WHERE rd.report_id=1;







-- =====================================================
-- QUERY 5
-- LẤY CHI TIẾT TRỪ GIỜ
-- =====================================================


SELECT


d.deduction_name,

r.hours


FROM production_report_deductions r



JOIN deduction_types d

ON r.deduction_type_id=d.id



WHERE r.report_id=1;