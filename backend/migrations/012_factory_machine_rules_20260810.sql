-- KTC 012 - Quy tắc máy theo thực tế xưởng ngày 10/08/2026.
-- An toàn khi chạy lại; không xóa báo cáo sản xuất.

ALTER TABLE machines ADD COLUMN IF NOT EXISTS is_automatic TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS max_workers_per_machine INT NOT NULL DEFAULT 1;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS output_basis VARCHAR(20) NOT NULL DEFAULT 'PRODUCT';

-- Mặc định mọi máy: máy thường, 1 người/máy, sản lượng theo sản phẩm.
UPDATE machines SET
  is_automatic = COALESCE(is_automatic, 0),
  max_workers_per_machine = CASE WHEN max_workers_per_machine IS NULL OR max_workers_per_machine < 1 THEN 1 ELSE max_workers_per_machine END,
  output_basis = CASE WHEN output_basis IS NULL OR output_basis = '' THEN 'PRODUCT' ELSE UPPER(output_basis) END;

-- Quy tắc riêng Gia công/Cắt-Lồng. Chỉ áp dụng các mã máy dạng số/cách ghi rõ ràng,
-- không match nhầm các mã sản phẩm/mã máy kiểu c2556-11.
UPDATE machines m JOIN processes p ON p.id = m.process_id
SET m.is_automatic = 1, m.output_basis = 'MACHINE'
WHERE p.process_code = 'GC' AND UPPER(REPLACE(REPLACE(TRIM(m.machine_code),' ',''),'MÁY','MAY')) IN
('1','01','M1','M01','MAY1','MAY01','MAY-1','MACHINE1','MACHINE-1',
 '2','02','M2','M02','MAY2','MAY02','MAY-2','MACHINE2','MACHINE-2',
 '3','03','M3','M03','MAY3','MAY03','MAY-3','MACHINE3','MACHINE-3',
 '4','04','M4','M04','MAY4','MAY04','MAY-4','MACHINE4','MACHINE-4',
 '8','08','M8','M08','MAY8','MAY08','MAY-8','MACHINE8','MACHINE-8',
 '9','09','M9','M09','MAY9','MAY09','MAY-9','MACHINE9','MACHINE-9',
 '10','M10','MAY10','MAY-10','MACHINE10','MACHINE-10',
 '11','M11','MAY11','MAY-11','MACHINE11','MACHINE-11',
 '14','M14','MAY14','MAY-14','MACHINE14','MACHINE-14',
 '16','M16','MAY16','MAY-16','MACHINE16','MACHINE-16',
 '17','M17','MAY17','MAY-17','MACHINE17','MACHINE-17',
 '23','M23','MAY23','MAY-23','MACHINE23','MACHINE-23',
 '24','M24','MAY24','MAY-24','MACHINE24','MACHINE-24',
 '25','M25','MAY25','MAY-25','MACHINE25','MACHINE-25',
 '26','M26','MAY26','MAY-26','MACHINE26','MACHINE-26');

UPDATE machines m JOIN processes p ON p.id = m.process_id
SET m.max_workers_per_machine = 2, m.output_basis = 'MACHINE'
WHERE p.process_code = 'GC' AND UPPER(REPLACE(REPLACE(TRIM(m.machine_code),' ',''),'MÁY','MAY')) IN
('5','05','M5','M05','MAY5','MAY05','MAY-5','MACHINE5','MACHINE-5',
 '6','06','M6','M06','MAY6','MAY06','MAY-6','MACHINE6','MACHINE-6',
 '7','07','M7','M07','MAY7','MAY07','MAY-7','MACHINE7','MACHINE-7',
 '11','M11','MAY11','MAY-11','MACHINE11','MACHINE-11');

-- Đo và Ép bắt buộc 1 người/1 máy; Kiểm cũng tối đa 1 người/máy.
UPDATE machines m JOIN processes p ON p.id = m.process_id
SET m.max_workers_per_machine = 1
WHERE p.process_code IN ('DO','EP','K1','K2','CAN');

CREATE INDEX IF NOT EXISTS idx_machines_factory_policy
ON machines(process_id, status, is_automatic, max_workers_per_machine, output_basis);
