-- KTC: mở rộng form báo cáo theo file mẫu, không phá dữ liệu cũ
ALTER TABLE production_reports_temp
  ADD COLUMN IF NOT EXISTS entry_date DATE NULL AFTER work_date,
  ADD COLUMN IF NOT EXISTS extra_data JSON NULL AFTER note;

ALTER TABLE production_reports
  ADD COLUMN IF NOT EXISTS entry_date DATE NULL AFTER work_date,
  ADD COLUMN IF NOT EXISTS extra_data JSON NULL AFTER note;

UPDATE production_reports_temp SET entry_date = DATE(created_at) WHERE entry_date IS NULL;
UPDATE production_reports SET entry_date = DATE(created_at) WHERE entry_date IS NULL;

INSERT INTO processes (id, process_code, process_name, status)
VALUES
  (60001, 'DO', 'Đo', 'active'),
  (60002, 'CAN', 'Cán', 'active'),
  (60003, 'EP', 'Ép', 'active'),
  (60004, 'XLBV', 'Xử lý bavia', 'active'),
  (60005, 'SX3', 'Sản xuất 3 - Lắp ráp', 'active')
ON DUPLICATE KEY UPDATE process_name=VALUES(process_name), status='active';
