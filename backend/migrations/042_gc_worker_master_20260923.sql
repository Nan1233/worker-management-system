-- KTC 042: Canonical GC worker master for TEST.
-- Source: worker list supplied by the user on 2026-09-22/23.
-- Scope: GC worker assignment only. Other process assignments are untouched.
-- Historical production/report rows are untouched.

-- This migration is intentionally written without session variables because the
-- Cloudflare/TiDB HTTP runner executes each SQL statement independently.

DROP TEMPORARY TABLE IF EXISTS tmp_gc_workers_20260923;
CREATE TEMPORARY TABLE tmp_gc_workers_20260923 (
  worker_code VARCHAR(160) NOT NULL PRIMARY KEY,
  worker_name VARCHAR(255) NOT NULL
);

INSERT INTO tmp_gc_workers_20260923 (worker_code, worker_name) VALUES
('1448','Lê Thị Dung'),('2959','Mùi Văn Chường'),('3268','Điêu Chính Huynh'),('3277','Vì Thị Liệu'),
('4173','Mùi Văn Thanh'),('4185','Vàng văn Hạnh'),('4344','Mùi Văn Lâm'),('4382','Vừ A Nghệ'),
('4360','Xồng Y Hiền'),('4478','Hà Tiến Thành'),('4412','Lầu Thị Na'),('4310','Lò Văn Thành'),
('long','Vì Văn Long'),('761','Giàng Mí Vư'),('846','Và Y Mái'),('669','Vàng Thị Quỳnh Châu'),
('676','Mùa Cang Dinh'),('766','Bùi Tiến Thiệp'),('959','Đinh Thị Lâm Diệp'),('2284','Lò Thị Mư'),
('2649','Hoàng Thị Hoan'),('2890','La Văn La'),('3111','Quàng Thị Tiến'),('3959','Hoàng Văn Án'),
('4325','Nông Anh Tú'),('4418','Hoàng Thị Kim Tin'),('4456','Chương Văn Hôn'),('4504','Giàng A Mạnh'),
('655','Giàng Thị Đông'),('656','Vừ A Nánh'),('vong','Giàng A Vông'),('1246','Nguyễn Quang Tuấn'),
('3751','Nguyễn Đức Vinh'),('1733','Nguyễn Thị Ngân'),('2865','Vì Thị Thiếu'),('3919','Bùi Văn Nhượng'),
('4017','Đinh Thị Nga'),('4019','Đinh Văn Lưu'),('4110','Lường Văn Huyên'),('4335','Cầm Thị Viến'),
('4342','Mùi Văn Vặt'),('4352','Đinh Thị Vân'),('4384','Lý A Mà'),('4496','Phạm Văn Hào'),
('4489','Giàng A Tuấn'),('4490','Sùng Mí Mua'),('848','Vàng A Đon'),('t-551','Mùi Thị Ngọc Diệp'),
('666','Vàng Mười Phành'),('692','Vàng A Linh'),('947','Sùng Mí Say'),('849','Và Thị Hoa'),
('850','Giàng A Nọ'),('tria','Vừ A Trỉa'),('lua','Giàng Thị Lúa'),('2516','Đinh Thị Cúc'),
('3352','Vì Văn Sĩ'),('3353','Đinh Thị Thùy'),('3526','Đinh Thị Tân'),('4031','Lò Thị Hạnh'),
('3187','Đinh Thị Duân'),('698','Mua Mí Già'),('834','Giàng Seo Diêu'),('845','Giàng A Váng'),
('denh','Vừ A Dếnh'),('bong','Vàng Thị Bông'),('1777','Lê văn Khánh'),('958','Lục Văn Ngân'),
('49cdt-046','Đỗ Trung Anh'),('49cdt-049','Phạm Gia Bách'),('49cdt-050','Vũ Việt Bách'),('49cdt-052','Hà Việt Bút'),
('49cdt-055','Nguyễn Đức Hiếu'),('49cdt-056','Phạm Trung Hiếu'),('49cdt-059','Phạm Gia Huy'),('49cdt-064','Đào Anh Minh'),
('49cdt-065','Phan Bảo Minh'),('49cdt-073','Nguyễn Ngọc Minh Trí'),('49ck-076','Bùi Tuấn Lâm'),('49ck-078','Lê Nhật Bảo Long'),
('49ck-084','Nguyễn Hải Thanh'),('49dl1-025','Đặng Thế Bảo'),('49dl1-026','Nguyễn Tiến Công'),('49dl1-027','Nguyễn Minh Đức'),
('49dl1-028','Đỗ Duy Hoàng Dương'),('49dl1-030','Bùi Đức Huy'),('49dl1-032','Nguyễn Dương Chí Kiên'),('49dl1-038','Nguyễn Trọng Tấn'),
('49dl1-040','Vũ Viết Thái'),('49dl1-042','Hoàng Tuấn Tú'),('49dl1-044','Hoàng Minh Tùng'),('49dllh1-001','Nguyễn Đức Anh'),
('49dllh1-002','Vũ Mạnh Hoàng Anh'),('49dllh1-014','Phùng Gia Phát'),('49dllh1-015','Lê Minh Phúc'),('49dllh1-022','Trần Hoàng Trung');

-- 1) Existing canonical code: update only status/name. Never rewrite the unique key.
UPDATE workers w
JOIN users u ON u.id = w.user_id
JOIN tmp_gc_workers_20260923 c
  ON LOWER(TRIM(w.worker_code)) = LOWER(TRIM(c.worker_code))
SET w.status = 'active',
    u.full_name = c.worker_name,
    u.status = 'active';

-- 2) Name reconciliation: only rename when the target code is not owned by another worker.
-- Use NOT EXISTS so uq_workers_code can never be violated by this statement.
UPDATE workers w
JOIN users u ON u.id = w.user_id
JOIN tmp_gc_workers_20260923 c
  ON LOWER(TRIM(u.full_name)) = LOWER(TRIM(c.worker_name))
SET w.worker_code = c.worker_code,
    w.status = 'active',
    u.full_name = c.worker_name,
    u.status = 'active'
WHERE LOWER(TRIM(w.worker_code)) <> LOWER(TRIM(c.worker_code))
  AND NOT EXISTS (
    SELECT 1
    FROM workers owner_w
    WHERE owner_w.id <> w.id
      AND LOWER(TRIM(owner_w.worker_code)) = LOWER(TRIM(c.worker_code))
  );

-- 3) Create missing users only when neither the worker code nor username exists.
INSERT INTO users (username, password, full_name, role, status)
SELECT c.worker_code, '', c.worker_name, 'worker', 'active'
FROM tmp_gc_workers_20260923 c
LEFT JOIN workers w ON LOWER(TRIM(w.worker_code)) = LOWER(TRIM(c.worker_code))
LEFT JOIN users u ON LOWER(TRIM(u.username)) = LOWER(TRIM(c.worker_code))
WHERE w.id IS NULL AND u.id IS NULL;

-- 4) Create missing worker rows only when the canonical code is still unowned.
INSERT INTO workers (user_id, worker_code, phone, department, position, training_percent, status)
SELECT u.id, c.worker_code, NULL, 'San xuat', 'Cong nhan', 100, 'active'
FROM tmp_gc_workers_20260923 c
JOIN users u ON LOWER(TRIM(u.username)) = LOWER(TRIM(c.worker_code))
LEFT JOIN workers w ON w.user_id = u.id
LEFT JOIN workers owner_w
  ON LOWER(TRIM(owner_w.worker_code)) = LOWER(TRIM(c.worker_code))
WHERE w.id IS NULL
  AND owner_w.id IS NULL;

-- 5) Resolve GC process id inline; no @gc_process_id session variable.
DELETE wp
FROM worker_processes wp
JOIN workers w ON w.id = wp.worker_id
WHERE wp.process_id = (
  SELECT id FROM processes
  WHERE UPPER(TRIM(process_code)) = 'GC'
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM tmp_gc_workers_20260923 c
  WHERE LOWER(TRIM(c.worker_code)) = LOWER(TRIM(w.worker_code))
);

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id,
       (SELECT id FROM processes WHERE UPPER(TRIM(process_code)) = 'GC' LIMIT 1)
FROM workers w
JOIN tmp_gc_workers_20260923 c
  ON LOWER(TRIM(w.worker_code)) = LOWER(TRIM(c.worker_code))
WHERE (SELECT id FROM processes WHERE UPPER(TRIM(process_code)) = 'GC' LIMIT 1) IS NOT NULL
  AND w.status = 'active';

SELECT c.worker_code, c.worker_name
FROM tmp_gc_workers_20260923 c
LEFT JOIN workers w ON LOWER(TRIM(w.worker_code)) = LOWER(TRIM(c.worker_code))
WHERE w.id IS NULL
ORDER BY c.worker_code;

SELECT COUNT(*) AS canonical_gc_worker_count
FROM worker_processes wp
JOIN workers w ON w.id = wp.worker_id
WHERE wp.process_id = (
  SELECT id FROM processes
  WHERE UPPER(TRIM(process_code)) = 'GC'
  LIMIT 1
)
AND w.status = 'active';
