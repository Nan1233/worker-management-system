-- KTC 039: Replace canonical Gia công (GC) worker roster on TEST only.
-- Historical production reports are preserved; only GC worker assignments are replaced.

CREATE TEMPORARY TABLE _gc_worker_seed (
  worker_code VARCHAR(100) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (worker_code)
);

INSERT INTO _gc_worker_seed (worker_code, full_name) VALUES
('1448', 'Lê Thị Dung'),
('2959', 'Mùi Văn Chường'),
('3268', 'Điêu Chính Huynh'),
('3277', 'Vì Thị Liệu'),
('4173', 'Mùi Văn Thanh'),
('4185', 'Vàng văn Hạnh'),
('4344', 'Mùi Văn Lâm'),
('4382', 'Vừ A Nghệ'),
('4360', 'Xồng Y Hiền'),
('4478', 'Hà Tiến Thành'),
('4412', 'Lầu Thị Na'),
('4310', 'Lò Văn Thành'),
('LONG', 'Vì Văn Long'),
('761', 'Giàng Mí Vư'),
('846', 'Và Y Mái'),
('669', 'Vàng Thị Quỳnh Châu'),
('676', 'Mùa Cang Dinh'),
('766', 'Bùi Tiến Thiệp'),
('959', 'Đinh Thị Lâm Diệp'),
('2284', 'Lò Thị Mư'),
('2649', 'Hoàng Thị Hoan'),
('2890', 'La Văn La'),
('3111', 'Quàng Thị Tiến'),
('3959', 'Hoàng VĂn Án'),
('4325', 'Nông Anh Tú'),
('4418', 'Hoàng Thị Kim Tin'),
('4456', 'Chương Văn Hôn'),
('4504', 'Giàng A Mạnh'),
('655', 'Giàng Thị Đông'),
('656', 'Vừ A Nánh'),
('VONG', 'Giàng A Vông'),
('1246', 'Nguyễn Quang Tuấn'),
('3751', 'Nguyễn Đức Vinh'),
('1733', 'Nguyễn Thị Ngân'),
('2865', 'Vì Thị Thiếu'),
('3919', 'Bùi Văn Nhượng'),
('4017', 'Đinh Thị Nga'),
('4019', 'Đinh Văn Lưu'),
('4110', 'Lường Văn Huyên'),
('4335', 'Cầm Thị Viến'),
('4342', 'Mùi Văn Vặt'),
('4352', 'Đinh Thị Vân'),
('4384', 'Lý A Mà'),
('4496', 'Phạm Văn Hào'),
('4489', 'Giàng A Tuấn'),
('4490', 'Sùng Mí Mua'),
('848', 'Vàng A Đon'),
('T-551', 'Mùi Thị Ngọc Diệp'),
('666', 'Vàng Mười Phành'),
('692', 'Vàng A Linh'),
('947', 'Sùng Mí Say'),
('849', 'Và Thị Hoa'),
('850', 'Giàng A Nọ'),
('TRIA', 'Vừ A Trỉa'),
('LUA', 'Giàng Thị Lúa'),
('2516', 'Đinh Thị Cúc'),
('3352', 'Vì Văn Sĩ'),
('3353', 'Đinh Thị Thùy'),
('3526', 'Đinh Thị Tân'),
('4031', 'Lò Thị Hạnh'),
('3187', 'Đinh Thị Duân'),
('698', 'Mua Mí Già'),
('834', 'Giàng Seo Diêu'),
('845', 'Giàng A Váng'),
('DENH', 'Vừ A Dếnh'),
('BONG', 'Vàng Thị Bông'),
('1777', 'Lê văn Khánh'),
('958', 'Lục Văn Ngân'),
('49CĐT-046', 'Đỗ Trung Anh'),
('49CĐT-049', 'Phạm Gia Bách'),
('49CĐT-050', 'Vũ Việt Bách'),
('49CĐT-052', 'Hà Việt Bút'),
('49CĐT-055', 'Nguyễn Đức Hiếu'),
('49CĐT-056', 'Phạm Trung Hiếu'),
('49CĐT-059', 'Phạm Gia Huy'),
('49CĐT-064', 'Đào Anh Minh'),
('49CĐT-065', 'Phan Bảo Minh'),
('49CĐT-073', 'Nguyễn Ngọc Minh Trí'),
('49CK-076', 'Bùi Tuấn Lâm'),
('49CK-078', 'Lê Nhật Bảo Long'),
('49CK-084', 'Nguyễn Hải Thanh'),
('49ĐL1-025', 'Đặng Thế Bảo'),
('49ĐL1-026', 'Nguyễn Tiến Công'),
('49ĐL1-027', 'Nguyễn Minh Đức'),
('49ĐL1-028', 'Đỗ Duy Hoàng Dương'),
('49ĐL1-030', 'Bùi Đức Huy'),
('49ĐL1-032', 'Nguyễn Dương Chí Kiên'),
('49ĐL1-038', 'Nguyễn Trọng Tấn'),
('49ĐL1-040', 'Vũ Viết Thái'),
('49ĐL1-042', 'Hoàng Tuấn Tú'),
('49ĐL1-044', 'Hoàng Minh Tùng'),
('49DLLH1-001', 'Nguyễn Đức Anh'),
('49DLLH1-002', 'Vũ Mạnh Hoàng Anh'),
('49DLLH1-014', 'Phùng Gia Phát'),
('49DLLH1-015', 'Lê Minh Phúc'),
('49DLLH1-022', 'Trần Hoàng Trung');

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
  AND NOT EXISTS (
    SELECT 1 FROM users u WHERE u.username = s.worker_code
  );

INSERT INTO workers (
  user_id, worker_code, phone, department, position, training_percent, status
)
SELECT u.id, s.worker_code, NULL, 'Sản xuất', 'Công nhân', 100, 'active'
FROM _gc_worker_seed s
JOIN users u ON u.username = s.worker_code
LEFT JOIN workers w ON w.worker_code = s.worker_code
WHERE w.id IS NULL;

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, p.id
FROM workers w
JOIN _gc_worker_seed s ON s.worker_code = w.worker_code
JOIN processes p
  ON UPPER(TRIM(p.process_code)) = 'GC'
 AND COALESCE(p.status, 'active') IN ('active', 'enabled', '1');

DROP TEMPORARY TABLE _gc_worker_seed;
