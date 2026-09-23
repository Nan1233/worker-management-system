-- KTC 045: final GC worker roster for TEST.
-- Replaces only the active GC worker assignment; other process assignments and historical reports are preserved.
-- Missing source codes use lowercase, no-accent full-name slugs.
START TRANSACTION;

SET @gc_process_id := (
  SELECT id FROM processes
  WHERE UPPER(TRIM(process_code)) = 'GC'
  LIMIT 1
);

DROP TEMPORARY TABLE IF EXISTS tmp_gc_worker_canonical_20260923;
CREATE TEMPORARY TABLE tmp_gc_worker_canonical_20260923 (
  worker_code VARCHAR(160) NOT NULL PRIMARY KEY,
  worker_name VARCHAR(255) NOT NULL
);

INSERT INTO tmp_gc_worker_canonical_20260923 (worker_code, worker_name) VALUES
('1448','Lê Thị Dung'),('2959','Mùi Văn Chường'),('3268','Điêu Chính Huynh'),('3277','Vì Thị Liệu'),
('4173','Mùi Văn Thanh'),('4185','Vàng văn Hạnh'),('4344','Mùi Văn Lâm'),('4382','Vừ A Nghệ'),
('4360','Xồng Y Hiền'),('4478','Hà Tiến Thành'),('4412','Lầu Thị Na'),('4310','Lò Văn Thành'),
('vi-van-long','Vì Văn Long'),('761','Giàng Mí Vư'),('846','Và Y Mái'),('669','Vàng Thị Quỳnh Châu'),
('676','Mùa Cang Dinh'),('766','Bùi Tiến Thiệp'),('959','Đinh Thị Lâm Diệp'),('2284','Lò Thị Mư'),
('2649','Hoàng Thị Hoan'),('2890','La Văn La'),('3111','Quàng Thị Tiến'),('3959','Hoàng Văn Án'),
('4325','Nông Anh Tú'),('4418','Hoàng Thị Kim Tin'),('4456','Chương Văn Hôn'),('4504','Giàng A Mạnh'),
('655','Giàng Thị Đông'),('656','Vừ A Nánh'),('giang-a-vong','Giàng A Vông'),('1246','Nguyễn Quang Tuấn'),
('3751','Nguyễn Đức Vinh'),('1733','Nguyễn Thị Ngân'),('2865','Vì Thị Thiếu'),('3919','Bùi Văn Nhượng'),
('4017','Đinh Thị Nga'),('4019','Đinh Văn Lưu'),('4110','Lường Văn Huyên'),('4335','Cầm Thị Viến'),
('4342','Mùi Văn Vặt'),('4352','Đinh Thị Vân'),('4384','Lý A Mà'),('4496','Phạm Văn Hào'),
('4489','Giàng A Tuấn'),('4490','Sùng Mí Mua'),('848','Vàng A Đon'),('t-551','Mùi Thị Ngọc Diệp'),
('666','Vàng Mười Phành'),('692','Vàng A Linh'),('947','Sùng Mí Say'),('849','Và Thị Hoa'),
('850','Giàng A Nọ'),('vu-a-tria','Vừ A Trỉa'),('giang-thi-lua','Giàng Thị Lúa'),('2516','Đinh Thị Cúc'),
('3352','Vì Văn Sĩ'),('3353','Đinh Thị Thùy'),('3526','Đinh Thị Tân'),('4031','Lò Thị Hạnh'),
('3187','Đinh Thị Duân'),('698','Mua Mí Già'),('834','Giàng Seo Diêu'),('845','Giàng A Váng'),
('vu-a-denh','Vừ A Dếnh'),('vang-thi-bong','Vàng Thị Bông'),('1777','Lê văn Khánh'),('958','Lục Văn Ngân'),
('49cdt-046','Đỗ Trung Anh'),('49cdt-049','Phạm Gia Bách'),('49cdt-050','Vũ Việt Bách'),('49cdt-052','Hà Việt Bút'),
('49cdt-055','Nguyễn Đức Hiếu'),('49cdt-056','Phạm Trung Hiếu'),('49cdt-059','Phạm Gia Huy'),('49cdt-064','Đào Anh Minh'),
('49cdt-065','Phan Bảo Minh'),('49cdt-073','Nguyễn Ngọc Minh Trí'),('49ck-076','Bùi Tuấn Lâm'),('49ck-078','Lê Nhật Bảo Long'),
('49ck-084','Nguyễn Hải Thanh'),('49dl1-025','Đặng Thế Bảo'),('49dl1-026','Nguyễn Tiến Công'),('49dl1-027','Nguyễn Minh Đức'),
('49dl1-028','Đỗ Duy Hoàng Dương'),('49dl1-030','Bùi Đức Huy'),('49dl1-032','Nguyễn Dương Chí Kiên'),('49dl1-038','Nguyễn Trọng Tấn'),
('49dl1-040','Vũ Viết Thái'),('49dl1-042','Hoàng Tuấn Tú'),('49dl1-044','Hoàng Minh Tùng'),('49dllh1-001','Nguyễn Đức Anh'),
('49dllh1-002','Vũ Mạnh Hoàng Anh'),('49dllh1-014','Phùng Gia Phát'),('49dllh1-015','Lê Minh Phúc'),('49dllh1-022','Trần Hoàng Trung');

-- Remove every existing GC assignment first. No other process is touched.
DELETE wp
FROM worker_processes wp
WHERE wp.process_id = @gc_process_id;

-- Re-key existing workers by canonical code when possible.
UPDATE workers w
JOIN tmp_gc_worker_canonical_20260923 c
  ON LOWER(TRIM(w.worker_code)) = LOWER(TRIM(c.worker_code))
JOIN users u ON u.id = w.user_id
SET w.worker_code = c.worker_code,
    w.status = 'active',
    u.full_name = c.worker_name,
    u.status = 'active';

-- Re-key legacy rows whose worker code was not canonical, using the exact full name.
UPDATE workers w
JOIN users u ON u.id = w.user_id
JOIN tmp_gc_worker_canonical_20260923 c
  ON LOWER(TRIM(u.full_name)) = LOWER(TRIM(c.worker_name))
LEFT JOIN workers wc
  ON LOWER(TRIM(wc.worker_code)) = LOWER(TRIM(c.worker_code))
 AND wc.id <> w.id
SET w.worker_code = c.worker_code,
    w.status = 'active',
    u.full_name = c.worker_name,
    u.status = 'active'
WHERE wc.id IS NULL;

-- Create users for canonical workers that do not exist yet.
INSERT INTO users (username, password, full_name, role, status)
SELECT c.worker_code, '', c.worker_name, 'worker', 'active'
FROM tmp_gc_worker_canonical_20260923 c
LEFT JOIN workers w ON LOWER(TRIM(w.worker_code)) = LOWER(TRIM(c.worker_code))
LEFT JOIN users u ON LOWER(TRIM(u.username)) = LOWER(TRIM(c.worker_code))
WHERE w.id IS NULL AND u.id IS NULL;

-- Create missing worker rows from the canonical users.
INSERT INTO workers (user_id, worker_code, phone, department, position, training_percent, status)
SELECT u.id, c.worker_code, NULL, 'San xuat', 'Cong nhan', 100, 'active'
FROM tmp_gc_worker_canonical_20260923 c
JOIN users u ON LOWER(TRIM(u.username)) = LOWER(TRIM(c.worker_code))
LEFT JOIN workers w ON w.user_id = u.id
WHERE w.id IS NULL;

-- Rebuild GC assignments from the canonical roster only.
INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, @gc_process_id
FROM workers w
JOIN tmp_gc_worker_canonical_20260923 c
  ON LOWER(TRIM(w.worker_code)) = LOWER(TRIM(c.worker_code))
WHERE @gc_process_id IS NOT NULL AND w.status = 'active';

-- Fail the migration if the canonical roster is not exactly represented.
SET @expected_gc_workers := (SELECT COUNT(*) FROM tmp_gc_worker_canonical_20260923);
SET @actual_gc_workers := (
  SELECT COUNT(*)
  FROM worker_processes wp
  JOIN workers w ON w.id = wp.worker_id
  WHERE wp.process_id = @gc_process_id AND w.status = 'active'
);

IF @expected_gc_workers <> @actual_gc_workers THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GC worker canonical roster verification failed';
END IF;

DROP TEMPORARY TABLE tmp_gc_worker_canonical_20260923;
COMMIT;
