-- KTC TEST 046: final idempotent reset of current Gia công (Cắt/Lồng) master.
-- Lead and historical reports are preserved.
-- Only current GC assignments/master rows are rebuilt.
-- Worker codes are canonicalized: Vietnamese names -> lowercase ASCII slug;
-- 49<letters>-<3 digits> -> 49-<3 digits>.

SET @gc_process_id := (SELECT id FROM processes WHERE UPPER(TRIM(process_code))='GC' LIMIT 1);

-- Remove current GC assignments first; do not delete workers globally because
-- historical production reports can reference them.
DELETE FROM worker_processes WHERE process_id=@gc_process_id;

-- Temporarily move all former GC worker codes out of the unique-key namespace.
-- This makes the migration safe even when a canonical code is currently owned
-- by another GC worker.
UPDATE workers
SET worker_code = CONCAT('__gc_reset__', id)
WHERE id IN (
  SELECT x.worker_id FROM (
    SELECT DISTINCT wp.worker_id
    FROM worker_processes wp
    WHERE wp.process_id=@gc_process_id
  ) x
);

DROP TEMPORARY TABLE IF EXISTS tmp_gc_final_workers_20260924;
CREATE TEMPORARY TABLE tmp_gc_final_workers_20260924 (
  worker_code VARCHAR(160) NOT NULL PRIMARY KEY,
  worker_name VARCHAR(255) NOT NULL
);

-- Canonical roster. Name-based codes are deterministic and contain no accents,
-- spaces or uppercase letters. 49xx student codes are normalized to 49-xxx.
INSERT INTO tmp_gc_final_workers_20260924 (worker_code, worker_name) VALUES
('le-thi-dung','Lê Thị Dung'),('mui-van-chuong','Mùi Văn Chường'),('dieu-chinh-huynh','Điêu Chính Huynh'),
('vi-thi-lieu','Vì Thị Liệu'),('mui-van-thanh','Mùi Văn Thanh'),('vang-van-hanh','Vàng văn Hạnh'),
('mui-van-lam','Mùi Văn Lâm'),('vu-a-nghe','Vừ A Nghệ'),('xong-y-hien','Xồng Y Hiền'),
('ha-tien-thanh','Hà Tiến Thành'),('lau-thi-na','Lầu Thị Na'),('lo-van-thanh','Lò Văn Thành'),
('vi-van-long','Vì Văn Long'),('giang-mi-vu','Giàng Mí Vư'),('va-y-mai','Và Y Mái'),
('vang-thi-quynh-chau','Vàng Thị Quỳnh Châu'),('mua-cang-dinh','Mùa Cang Dinh'),('bui-tien-thiep','Bùi Tiến Thiệp'),
('dinh-thi-lam-diep','Đinh Thị Lâm Diệp'),('lo-thi-mu','Lò Thị Mư'),('hoang-thi-hoan','Hoàng Thị Hoan'),
('la-van-la','La Văn La'),('quang-thi-tien','Quàng Thị Tiến'),('hoang-van-an','Hoàng Văn Án'),
('nong-anh-tu','Nông Anh Tú'),('hoang-thi-kim-tin','Hoàng Thị Kim Tin'),('chuong-van-hon','Chương Văn Hôn'),
('giang-a-manh','Giàng A Mạnh'),('giang-thi-dong','Giàng Thị Đông'),('vu-a-nanh','Vừ A Nánh'),
('giang-a-vong','Giàng A Vông'),('nguyen-quang-tuan','Nguyễn Quang Tuấn'),('nguyen-duc-vinh','Nguyễn Đức Vinh'),
('nguyen-thi-ngan','Nguyễn Thị Ngân'),('vi-thi-thieu','Vì Thị Thiếu'),('bui-van-nhuong','Bùi Văn Nhượng'),
('dinh-thi-nga','Đinh Thị Nga'),('dinh-van-luu','Đinh Văn Lưu'),('luong-van-huyen','Lường Văn Huyên'),
('cam-thi-vien','Cầm Thị Viến'),('mui-van-vat','Mùi Văn Vặt'),('dinh-thi-van','Đinh Thị Vân'),
('ly-a-ma','Lý A Mà'),('pham-van-hao','Phạm Văn Hào'),('giang-a-tuan','Giàng A Tuấn'),
('sung-mi-mua','Sùng Mí Mua'),('vang-a-don','Vàng A Đon'),('mui-thi-ngoc-diep','Mùi Thị Ngọc Diệp'),
('vang-muoi-phanh','Vàng Mười Phành'),('vang-a-linh','Vàng A Linh'),('sung-mi-say','Sùng Mí Say'),
('va-thi-hoa','Và Thị Hoa'),('giang-a-no','Giàng A Nọ'),('vu-a-tria','Vừ A Trỉa'),
('giang-thi-lua','Giàng Thị Lúa'),('dinh-thi-cuc','Đinh Thị Cúc'),('vi-van-si','Vì Văn Sĩ'),
('dinh-thi-thuy','Đinh Thị Thùy'),('dinh-thi-tan','Đinh Thị Tân'),('lo-thi-hanh','Lò Thị Hạnh'),
('dinh-thi-duan','Đinh Thị Duân'),('mua-mi-gia','Mua Mí Già'),('giang-seo-dieu','Giàng Seo Diêu'),
('giang-a-vang','Giàng A Váng'),('vu-a-denh','Vừ A Dếnh'),('vang-thi-bong','Vàng Thị Bông'),
('le-van-khanh','Lê văn Khánh'),('luc-van-ngan','Lục Văn Ngân'),
('49-046','Đỗ Trung Anh'),('49-049','Phạm Gia Bách'),('49-050','Vũ Việt Bách'),('49-052','Hà Việt Bút'),
('49-055','Nguyễn Đức Hiếu'),('49-056','Phạm Trung Hiếu'),('49-059','Phạm Gia Huy'),('49-064','Đào Anh Minh'),
('49-065','Phan Bảo Minh'),('49-073','Nguyễn Ngọc Minh Trí'),('49-076','Bùi Tuấn Lâm'),('49-078','Lê Nhật Bảo Long'),
('49-084','Nguyễn Hải Thanh'),('49-025','Đặng Thế Bảo'),('49-026','Nguyễn Tiến Công'),('49-027','Nguyễn Minh Đức'),
('49-028','Đỗ Duy Hoàng Dương'),('49-030','Bùi Đức Huy'),('49-032','Nguyễn Dương Chí Kiên'),('49-038','Nguyễn Trọng Tấn'),
('49-040','Vũ Viết Thái'),('49-042','Hoàng Tuấn Tú'),('49-044','Hoàng Minh Tùng'),('49-001','Nguyễn Đức Anh'),
('49-002','Vũ Mạnh Hoàng Anh'),('49-014','Phùng Gia Phát'),('49-015','Lê Minh Phúc'),('49-022','Trần Hoàng Trung');

-- Existing worker is matched by exact normalized name. Update its canonical code;
-- missing users/workers are created. Existing Lead rows are untouched because
-- only the former GC worker set is considered here.
INSERT INTO users (username,password,full_name,role,status)
SELECT f.worker_code,'',f.worker_name,'worker','active'
FROM tmp_gc_final_workers_20260924 f
LEFT JOIN users u ON LOWER(TRIM(u.full_name))=LOWER(TRIM(f.worker_name))
WHERE u.id IS NULL;

UPDATE users u
JOIN tmp_gc_final_workers_20260924 f ON LOWER(TRIM(u.full_name))=LOWER(TRIM(f.worker_name))
SET u.full_name=f.worker_name,u.status='active'
WHERE u.role='worker';

-- Move any worker currently owning a canonical code out of the way only when
-- it is not the intended name match. This prevents uq_workers_code collisions.
UPDATE workers w
JOIN tmp_gc_final_workers_20260924 f ON LOWER(TRIM(w.worker_code))=LOWER(TRIM(f.worker_code))
JOIN users u ON u.id=w.user_id
SET w.worker_code=CONCAT('__gc_conflict__',w.id)
WHERE LOWER(TRIM(u.full_name))<>LOWER(TRIM(f.worker_name));

INSERT INTO workers (user_id,worker_code,phone,department,position,training_percent,status)
SELECT u.id,f.worker_code,NULL,'San xuat','Cong nhan',100,'active'
FROM tmp_gc_final_workers_20260924 f
JOIN users u ON LOWER(TRIM(u.full_name))=LOWER(TRIM(f.worker_name))
LEFT JOIN workers w ON w.user_id=u.id
WHERE w.id IS NULL;

UPDATE workers w
JOIN users u ON u.id=w.user_id
JOIN tmp_gc_final_workers_20260924 f ON LOWER(TRIM(u.full_name))=LOWER(TRIM(f.worker_name))
SET w.worker_code=f.worker_code,w.status='active';

INSERT IGNORE INTO worker_processes (worker_id,process_id)
SELECT w.id,@gc_process_id
FROM workers w JOIN users u ON u.id=w.user_id
JOIN tmp_gc_final_workers_20260924 f ON LOWER(TRIM(w.worker_code))=LOWER(TRIM(f.worker_code))
WHERE @gc_process_id IS NOT NULL;

-- Canonical Cắt/Lồng machines.
UPDATE machines SET status='inactive' WHERE process_id=@gc_process_id;
INSERT IGNORE INTO machines (process_id,machine_code,machine_name,is_automatic,max_workers_per_machine,status) VALUES
(@gc_process_id,'C1','Máy cắt số 1',0,1,'active'),(@gc_process_id,'C2','Máy cắt số 2',0,1,'active'),
(@gc_process_id,'C3','Máy cắt số 3',0,1,'active'),(@gc_process_id,'C4','Máy cắt số 4',0,1,'active'),
(@gc_process_id,'C5','Máy cắt số 5',0,1,'active'),(@gc_process_id,'C6','Máy cắt số 6',0,1,'active'),
(@gc_process_id,'C7','Máy cắt số 7',0,1,'active'),(@gc_process_id,'C8','Máy cắt số 8',0,1,'active'),
(@gc_process_id,'C9','Máy cắt số 9',0,1,'active'),(@gc_process_id,'C10','Máy cắt số 10',0,1,'active'),
(@gc_process_id,'C11','Máy cắt số 11',0,1,'active'),(@gc_process_id,'C12','Máy cắt số 12',0,1,'active'),
(@gc_process_id,'ML1','Máy lồng số 1',0,4,'active'),(@gc_process_id,'ML2','Máy lồng số 2',0,4,'active'),
(@gc_process_id,'ML3','Máy lồng số 3',0,4,'active'),(@gc_process_id,'ML4','Máy lồng số 4',0,4,'active'),
(@gc_process_id,'ML5','Máy lồng số 5',0,4,'active'),(@gc_process_id,'ML6','Máy lồng số 6',0,4,'active'),
(@gc_process_id,'ML7','Máy lồng số 7',0,4,'active'),(@gc_process_id,'ML8','Máy lồng số 8',0,4,'active'),
(@gc_process_id,'ML9','Máy lồng số 9',0,4,'active'),(@gc_process_id,'ML10','Máy lồng số 10',0,4,'active'),
(@gc_process_id,'ML11','Máy lồng số 11',0,4,'active'),(@gc_process_id,'ML12','Máy lồng số 12',0,4,'active'),
(@gc_process_id,'ML13','Máy lồng số 13',0,4,'active'),(@gc_process_id,'ML14','Máy lồng số 14',0,4,'active'),
(@gc_process_id,'ML15','Máy lồng số 15',0,4,'active'),(@gc_process_id,'ML16','Máy lồng số 16',0,4,'active'),
(@gc_process_id,'ML17','Máy lồng số 17',0,4,'active'),(@gc_process_id,'ML18','Máy lồng số 18',0,4,'active'),
(@gc_process_id,'ML19','Máy lồng số 19',0,4,'active'),(@gc_process_id,'ML20','Máy lồng số 20',0,4,'active');

DROP TEMPORARY TABLE tmp_gc_final_workers_20260924;
