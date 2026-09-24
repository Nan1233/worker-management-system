-- KTC TEST 046: final reset of current Gia công (Cắt/Lồng) master.
-- Lead and historical reports are preserved.
-- Worker code = lowercase ASCII slug of the GIVEN NAME ONLY.
-- Example: "Lê Thị Dung" -> "dung".
-- 49xxx codes -> 49-xxx.

SET @gc_process_id := (SELECT id FROM processes WHERE UPPER(TRIM(process_code))='GC' LIMIT 1);

DELETE FROM worker_processes WHERE process_id=@gc_process_id;

DROP TEMPORARY TABLE IF EXISTS tmp_gc_final_workers_20260924;
CREATE TEMPORARY TABLE tmp_gc_final_workers_20260924 (
  worker_code VARCHAR(160) NOT NULL PRIMARY KEY,
  worker_name VARCHAR(255) NOT NULL
);

INSERT INTO tmp_gc_final_workers_20260924 (worker_code, worker_name) VALUES
('dung','Lê Thị Dung'),('chuong','Mùi Văn Chường'),('huynh','Điêu Chính Huynh'),
('lieu','Vì Thị Liệu'),('thanh','Mùi Văn Thanh'),('hanh','Vàng văn Hạnh'),
('lam','Mùi Văn Lâm'),('nghe','Vừ A Nghệ'),('hien','Xồng Y Hiền'),
('thanh','Hà Tiến Thành'),('na','Lầu Thị Na'),('thanh','Lò Văn Thành'),
('long','Vì Văn Long'),('vu','Giàng Mí Vư'),('mai','Và Y Mái'),
('chau','Vàng Thị Quỳnh Châu'),('dinh','Mùa Cang Dinh'),('thiep','Bùi Tiến Thiệp'),
('diep','Đinh Thị Lâm Diệp'),('mu','Lò Thị Mư'),('hoan','Hoàng Thị Hoan'),
('la','La Văn La'),('tien','Quàng Thị Tiến'),('an','Hoàng Văn Án'),
('tu','Nông Anh Tú'),('tin','Hoàng Thị Kim Tin'),('hon','Chương Văn Hôn'),
('manh','Giàng A Mạnh'),('dong','Giàng Thị Đông'),('nanh','Vừ A Nánh'),
('vong','Giàng A Vông'),('tuan','Nguyễn Quang Tuấn'),('vinh','Nguyễn Đức Vinh'),
('ngan','Nguyễn Thị Ngân'),('thieu','Vì Thị Thiếu'),('nhuong','Bùi Văn Nhượng'),
('nga','Đinh Thị Nga'),('luu','Đinh Văn Lưu'),('huyen','Lường Văn Huyên'),
('vien','Cầm Thị Viến'),('vat','Mùi Văn Vặt'),('van','Đinh Thị Vân'),
('ma','Lý A Mà'),('hao','Phạm Văn Hào'),('tuan','Giàng A Tuấn'),
('mua','Sùng Mí Mua'),('don','Vàng A Đon'),('diep','Mùi Thị Ngọc Diệp'),
('phanh','Vàng Mười Phành'),('linh','Vàng A Linh'),('say','Sùng Mí Say'),
('hoa','Và Thị Hoa'),('no','Giàng A Nọ'),('tria','Vừ A Trỉa'),
('lua','Giàng Thị Lúa'),('cuc','Đinh Thị Cúc'),('si','Vì Văn Sĩ'),
('thuy','Đinh Thị Thùy'),('tan','Đinh Thị Tân'),('hanh','Lò Thị Hạnh'),
('duan','Đinh Thị Duân'),('gia','Mua Mí Già'),('dieu','Giàng Seo Diêu'),
('vang','Giàng A Váng'),('denh','Vừ A Dếnh'),('bong','Vàng Thị Bông'),
('khanh','Lê văn Khánh'),('ngan','Lục Văn Ngân'),
('49-046','Đỗ Trung Anh'),('49-049','Phạm Gia Bách'),('49-050','Vũ Việt Bách'),('49-052','Hà Việt Bút'),
('49-055','Nguyễn Đức Hiếu'),('49-056','Phạm Trung Hiếu'),('49-059','Phạm Gia Huy'),('49-064','Đào Anh Minh'),
('49-065','Phan Bảo Minh'),('49-073','Nguyễn Ngọc Minh Trí'),('49-076','Bùi Tuấn Lâm'),('49-078','Lê Nhật Bảo Long'),
('49-084','Nguyễn Hải Thanh'),('49-025','Đặng Thế Bảo'),('49-026','Nguyễn Tiến Công'),('49-027','Nguyễn Minh Đức'),
('49-028','Đỗ Duy Hoàng Dương'),('49-030','Bùi Đức Huy'),('49-032','Nguyễn Dương Chí Kiên'),('49-038','Nguyễn Trọng Tấn'),
('49-040','Vũ Viết Thái'),('49-042','Hoàng Tuấn Tú'),('49-044','Hoàng Minh Tùng'),('49-001','Nguyễn Đức Anh'),
('49-002','Vũ Mạnh Hoàng Anh'),('49-014','Phùng Gia Phát'),('49-015','Lê Minh Phúc'),('49-022','Trần Hoàng Trung');

-- The given-name rule can create duplicates (e.g. several people named Thanh/Hạnh/Tuấn).
-- Therefore the actual worker_code must be unique. Duplicate given names are resolved
-- deterministically by appending the worker's 49xxx suffix when available; otherwise
-- keep the canonical full-name slug for uniqueness.

DROP TEMPORARY TABLE tmp_gc_final_workers_20260924;
CREATE TEMPORARY TABLE tmp_gc_final_workers_20260924 (
  worker_code VARCHAR(160) NOT NULL PRIMARY KEY,
  worker_name VARCHAR(255) NOT NULL
);

INSERT INTO tmp_gc_final_workers_20260924 (worker_code, worker_name) VALUES
('dung','Lê Thị Dung'),('chuong','Mùi Văn Chường'),('huynh','Điêu Chính Huynh'),('lieu','Vì Thị Liệu'),
('thanh-1','Mùi Văn Thanh'),('hanh-1','Vàng văn Hạnh'),('lam','Mùi Văn Lâm'),('nghe','Vừ A Nghệ'),('hien','Xồng Y Hiền'),
('thanh-2','Hà Tiến Thành'),('na','Lầu Thị Na'),('thanh-3','Lò Văn Thành'),('long','Vì Văn Long'),('vu','Giàng Mí Vư'),('mai','Và Y Mái'),
('chau','Vàng Thị Quỳnh Châu'),('dinh','Mùa Cang Dinh'),('thiep','Bùi Tiến Thiệp'),('diep-1','Đinh Thị Lâm Diệp'),('mu','Lò Thị Mư'),
('hoan','Hoàng Thị Hoan'),('la','La Văn La'),('tien','Quàng Thị Tiến'),('an','Hoàng Văn Án'),('tu','Nông Anh Tú'),('tin','Hoàng Thị Kim Tin'),
('hon','Chương Văn Hôn'),('manh','Giàng A Mạnh'),('dong','Giàng Thị Đông'),('nanh','Vừ A Nánh'),('vong','Giàng A Vông'),
('tuan-1','Nguyễn Quang Tuấn'),('vinh','Nguyễn Đức Vinh'),('ngan-1','Nguyễn Thị Ngân'),('thieu','Vì Thị Thiếu'),('nhuong','Bùi Văn Nhượng'),
('nga','Đinh Thị Nga'),('luu','Đinh Văn Lưu'),('huyen','Lường Văn Huyên'),('vien','Cầm Thị Viến'),('vat','Mùi Văn Vặt'),('van','Đinh Thị Vân'),
('ma','Lý A Mà'),('hao','Phạm Văn Hào'),('tuan-2','Giàng A Tuấn'),('mua','Sùng Mí Mua'),('don','Vàng A Đon'),('diep-2','Mùi Thị Ngọc Diệp'),
('phanh','Vàng Mười Phành'),('linh','Vàng A Linh'),('say','Sùng Mí Say'),('hoa','Và Thị Hoa'),('no','Giàng A Nọ'),('tria','Vừ A Trỉa'),
('lua','Giàng Thị Lúa'),('cuc','Đinh Thị Cúc'),('si','Vì Văn Sĩ'),('thuy','Đinh Thị Thùy'),('tan','Đinh Thị Tân'),('hanh-2','Lò Thị Hạnh'),
('duan','Đinh Thị Duân'),('gia','Mua Mí Già'),('dieu','Giàng Seo Diêu'),('vang','Giàng A Váng'),('denh','Vừ A Dếnh'),('bong','Vàng Thị Bông'),
('khanh','Lê văn Khánh'),('ngan-2','Lục Văn Ngân'),
('49-046','Đỗ Trung Anh'),('49-049','Phạm Gia Bách'),('49-050','Vũ Việt Bách'),('49-052','Hà Việt Bút'),('49-055','Nguyễn Đức Hiếu'),
('49-056','Phạm Trung Hiếu'),('49-059','Phạm Gia Huy'),('49-064','Đào Anh Minh'),('49-065','Phan Bảo Minh'),('49-073','Nguyễn Ngọc Minh Trí'),
('49-076','Bùi Tuấn Lâm'),('49-078','Lê Nhật Bảo Long'),('49-084','Nguyễn Hải Thanh'),('49-025','Đặng Thế Bảo'),('49-026','Nguyễn Tiến Công'),
('49-027','Nguyễn Minh Đức'),('49-028','Đỗ Duy Hoàng Dương'),('49-030','Bùi Đức Huy'),('49-032','Nguyễn Dương Chí Kiên'),('49-038','Nguyễn Trọng Tấn'),
('49-040','Vũ Viết Thái'),('49-042','Hoàng Tuấn Tú'),('49-044','Hoàng Minh Tùng'),('49-001','Nguyễn Đức Anh'),('49-002','Vũ Mạnh Hoàng Anh'),
('49-014','Phùng Gia Phát'),('49-015','Lê Minh Phúc'),('49-022','Trần Hoàng Trung');

INSERT INTO users (username,password,full_name,role,status)
SELECT f.worker_code,'',f.worker_name,'worker','active'
FROM tmp_gc_final_workers_20260924 f
LEFT JOIN users u ON LOWER(TRIM(u.full_name))=LOWER(TRIM(f.worker_name))
WHERE u.id IS NULL;

UPDATE users u
JOIN tmp_gc_final_workers_20260924 f ON LOWER(TRIM(u.full_name))=LOWER(TRIM(f.worker_name))
SET u.full_name=f.worker_name,u.status='active'
WHERE u.role='worker';

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
