-- KTC 039: Replace canonical Gia cong (GC) worker roster on TEST only.
-- Historical production reports are preserved; only GC worker assignments are replaced.

CREATE TEMPORARY TABLE _gc_worker_seed (
  worker_code VARCHAR(100) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (worker_code)
);

INSERT INTO _gc_worker_seed (worker_code, full_name) VALUES
('1448', 'Le Thi Dung'),
('2959', 'Mui Van Chuong'),
('3268', 'Dieu Chinh Huynh'),
('3277', 'Vi Thi Lieu'),
('4173', 'Mui Van Thanh'),
('4185', 'Vang van Hanh'),
('4344', 'Mui Van Lam'),
('4382', 'Vu A Nghe'),
('4360', 'Xong Y Hien'),
('4478', 'Ha Tien Thanh'),
('4412', 'Lau Thi Na'),
('4310', 'Lo Van Thanh'),
('long', 'Vi Van Long'),
('761', 'Giang Mi Vu'),
('846', 'Va Y Mai'),
('669', 'Vang Thi Quynh Chau'),
('676', 'Mua Cang Dinh'),
('766', 'Bui Tien Thiep'),
('959', 'Dinh Thi Lam Diep'),
('2284', 'Lo Thi Mu'),
('2649', 'Hoang Thi Hoan'),
('2890', 'La Van La'),
('3111', 'Quang Thi Tien'),
('3959', 'Hoang Van An'),
('4325', 'Nong Anh Tu'),
('4418', 'Hoang Thi Kim Tin'),
('4456', 'Chuong Van Hon'),
('4504', 'Giang A Manh'),
('655', 'Giang Thi Dong'),
('656', 'Vu A Nanh'),
('vong', 'Giang A Vong'),
('1246', 'Nguyen Quang Tuan'),
('3751', 'Nguyen Duc Vinh'),
('1733', 'Nguyen Thi Ngan'),
('2865', 'Vi Thi Thieu'),
('3919', 'Bui Van Nhuong'),
('4017', 'Dinh Thi Nga'),
('4019', 'Dinh Van Luu'),
('4110', 'Luong Van Huyen'),
('4335', 'Cam Thi Vien'),
('4342', 'Mui Van Vat'),
('4352', 'Dinh Thi Van'),
('4384', 'Ly A Ma'),
('4496', 'Pham Van Hao'),
('4489', 'Giang A Tuan'),
('4490', 'Sung Mi Mua'),
('848', 'Vang A Don'),
('T-551', 'Mui Thi Ngoc Diep'),
('666', 'Vang Muoi Phanh'),
('692', 'Vang A Linh'),
('947', 'Sung Mi Say'),
('849', 'Va Thi Hoa'),
('850', 'Giang A No'),
('tria', 'Vu A Tria'),
('lua', 'Giang Thi Lua'),
('2516', 'Dinh Thi Cuc'),
('3352', 'Vi Van Si'),
('3353', 'Dinh Thi Thuy'),
('3526', 'Dinh Thi Tan'),
('4031', 'Lo Thi Hanh'),
('3187', 'Dinh Thi Duan'),
('698', 'Mua Mi Gia'),
('834', 'Giang Seo Dieu'),
('845', 'Giang A Vang'),
('denh', 'Vu A Denh'),
('bong', 'Vang Thi Bong'),
('1777', 'Le van Khanh'),
('958', 'Luc Van Ngan'),
('49CDT-046', 'Do Trung Anh'),
('49CDT-049', 'Pham Gia Bach'),
('49CDT-050', 'Vu Viet Bach'),
('49CDT-052', 'Ha Viet But'),
('49CDT-055', 'Nguyen Duc Hieu'),
('49CDT-056', 'Pham Trung Hieu'),
('49CDT-059', 'Pham Gia Huy'),
('49CDT-064', 'Dao Anh Minh'),
('49CDT-065', 'Phan Bao Minh'),
('49CDT-073', 'Nguyen Ngoc Minh Tri'),
('49CK-076', 'Bui Tuan Lam'),
('49CK-078', 'Le Nhat Bao Long'),
('49CK-084', 'Nguyen Hai Thanh'),
('49DL1-025', 'Dang The Bao'),
('49DL1-026', 'Nguyen Tien Cong'),
('49DL1-027', 'Nguyen Minh Duc'),
('49DL1-028', 'Do Duy Hoang Duong'),
('49DL1-030', 'Bui Duc Huy'),
('49DL1-032', 'Nguyen Duong Chi Kien'),
('49DL1-038', 'Nguyen Trong Tan'),
('49DL1-040', 'Vu Viet Thai'),
('49DL1-042', 'Hoang Tuan Tu'),
('49DL1-044', 'Hoang Minh Tung'),
('49DLLH1-001', 'Nguyen Duc Anh'),
('49DLLH1-002', 'Vu Manh Hoang Anh'),
('49DLLH1-014', 'Phung Gia Phat'),
('49DLLH1-015', 'Le Minh Phuc'),
('49DLLH1-022', 'Tran Hoang Trung');

DELETE wp
FROM worker_processes wp
JOIN processes p ON p.id = wp.process_id
WHERE UPPER(TRIM(p.process_code)) = 'GC';

UPDATE users u
JOIN workers w ON w.user_id = u.id
JOIN _gc_worker_seed s ON s.worker_code = w.worker_code
SET u.full_name = s.full_name,
    u.status = 'active'
WHERE u.role = 'worker';

UPDATE workers w
JOIN _gc_worker_seed s ON s.worker_code = w.worker_code
SET w.status = 'active';

INSERT INTO users (username, password, full_name, role, status)
SELECT s.worker_code, '', s.full_name, 'worker', 'active'
FROM _gc_worker_seed s
LEFT JOIN workers w ON w.worker_code = s.worker_code
WHERE w.id IS NULL
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.username = s.worker_code);

INSERT INTO workers (user_id, worker_code, phone, department, position, training_percent, status)
SELECT u.id, s.worker_code, NULL, 'San xuat', 'Cong nhan', 100, 'active'
FROM _gc_worker_seed s
JOIN users u ON u.username = s.worker_code
LEFT JOIN workers w ON w.worker_code = s.worker_code
WHERE w.id IS NULL;

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, p.id
FROM workers w
JOIN _gc_worker_seed s ON s.worker_code = w.worker_code
JOIN processes p ON UPPER(TRIM(p.process_code)) = 'GC'
 AND COALESCE(p.status, 'active') IN ('active', 'enabled', '1');

DROP TEMPORARY TABLE _gc_worker_seed;
