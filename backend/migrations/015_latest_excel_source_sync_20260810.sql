-- KTC 015: Đồng bộ nguồn Excel mới nhất 10/08/2026.
-- Nguồn:
--   file mẫu(6).xlsx = trùng file mẫu(5).xlsx
--   Book1(8).xlsx    = trùng Book1(7).xlsx
--   Book2(4).xlsx    = bỏ thời gian chuẩn của QC8-1467 và QC8-1470
-- Đồng thời bổ sung 3 mã nhân sự có trong các script nhân sự lịch sử nhưng thiếu snapshot chính:
-- HẠO -> XLBV, thu -> GC, vấn -> MAI + DO.

-- Book2(4): hai mã này không còn thời gian chuẩn hợp lệ, không được dùng giá trị cũ 146 giây.
DELETE pms
FROM product_machine_standards pms
JOIN processes p ON p.id = pms.process_id
WHERE p.process_code = 'MAI'
  AND pms.product_code IN ('QC8-1467', 'QC8-1470');

DELETE pmv
FROM product_machine_standard_variants pmv
JOIN processes p ON p.id = pmv.process_id
WHERE p.process_code = 'MAI'
  AND pmv.product_code IN ('QC8-1467', 'QC8-1470');

DELETE ps
FROM product_standards ps
JOIN processes p ON p.id = ps.process_id
WHERE p.process_code = 'MAI'
  AND ps.product_code IN ('QC8-1467', 'QC8-1470');

-- Bổ sung các mã nhân sự lịch sử còn thiếu trong snapshot file mẫu.
INSERT INTO users (username, password, full_name, role, status)
VALUES
  ('HẠO', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'VÌ BU HẠO', 'worker', 'active'),
  ('thu', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Đỗ Hiền Thu', 'worker', 'active'),
  ('vấn', '$2b$10$QyhDl6txQD0MlrVfYt/8Ie.yk879utP08WB.4FbTZiW6yLIz96jN6', 'Lường Thị Vấn', 'worker', 'active')
ON DUPLICATE KEY UPDATE
  password = VALUES(password),
  full_name = VALUES(full_name),
  role = 'worker',
  status = 'active';

INSERT INTO workers (user_id, worker_code, department, position, training_percent, status)
SELECT u.id, u.username, 'Sản xuất', 'Công nhân', 100, 'active'
FROM users u
WHERE u.username IN ('HẠO', 'thu', 'vấn')
ON DUPLICATE KEY UPDATE
  user_id = VALUES(user_id),
  department = VALUES(department),
  position = VALUES(position),
  status = 'active';

INSERT IGNORE INTO worker_processes (worker_id, process_id)
SELECT w.id, p.id
FROM workers w
JOIN processes p
WHERE (w.worker_code = 'HẠO' AND p.process_code = 'XLBV')
   OR (w.worker_code = 'thu' AND p.process_code = 'GC')
   OR (w.worker_code = 'vấn' AND p.process_code IN ('MAI','DO'));

-- Kiểm tra riêng nguồn Book2 mới.
SELECT
  p.process_code,
  pms.product_code,
  COUNT(*) AS so_dinh_muc_con_lai
FROM product_machine_standards pms
JOIN processes p ON p.id = pms.process_id
WHERE p.process_code = 'MAI'
  AND pms.product_code IN ('QC8-1467','QC8-1470')
GROUP BY p.process_code, pms.product_code;
