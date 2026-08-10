-- KTC 013 - Sản lượng máy theo sản phẩm + thời gian chạy từ Book2(3).xlsx.
-- Book2 cung cấp định mức chi tiết cho Mài: mã sản phẩm, số máy, thời gian chuẩn và năng suất/giờ.
-- Hai xung đột QC4-6262 trên máy 3 và 5 được giữ đầy đủ trong bảng biến thể; bản dòng nguồn lớn hơn được chọn làm bản đang dùng.

ALTER TABLE product_machine_standards ADD COLUMN IF NOT EXISTS standard_time_seconds DECIMAL(18,6) NULL;
ALTER TABLE product_machine_standards ADD COLUMN IF NOT EXISTS calculated_output_per_hour DECIMAL(18,6) NULL;
ALTER TABLE product_machine_standards ADD COLUMN IF NOT EXISTS source_name VARCHAR(120) NULL;
ALTER TABLE product_machine_standards ADD COLUMN IF NOT EXISTS source_row_number INT NULL;
ALTER TABLE production_temp_machine_lines ADD COLUMN IF NOT EXISTS standard_time_seconds DECIMAL(18,6) NULL;
ALTER TABLE production_report_machine_lines ADD COLUMN IF NOT EXISTS standard_time_seconds DECIMAL(18,6) NULL;

CREATE TABLE IF NOT EXISTS product_machine_standard_variants (
  id BIGINT NOT NULL AUTO_INCREMENT,
  process_id BIGINT NOT NULL,
  product_code VARCHAR(180) NOT NULL,
  machine_code VARCHAR(100) NOT NULL,
  standard_time_seconds DECIMAL(18,6) NOT NULL,
  calculated_output_per_hour DECIMAL(18,6) NOT NULL,
  source_name VARCHAR(120) NOT NULL,
  source_sheet VARCHAR(120) NOT NULL,
  source_row_number INT NOT NULL,
  source_note TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pms_variant_source (process_id, product_code, machine_code, source_name, source_row_number),
  KEY idx_pms_variant_lookup (process_id, product_code, machine_code, is_active)
);

UPDATE machines m JOIN processes p ON p.id=m.process_id SET m.output_basis='MACHINE' WHERE p.process_code='GC' AND (m.is_automatic=1 OR TRIM(m.machine_code) IN ('5','6','7','11'));

-- Bổ sung mã sản phẩm Mài từ Book2 nếu master cũ chưa có. Đây chỉ là fallback; khi có định mức máy thì luôn ưu tiên định mức máy.
INSERT INTO product_standards (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT p.id, 'MÀI - BOOK2', src.product_code, MAX(src.output_per_hour), 0, 'active'
FROM processes p JOIN (
SELECT '30375120' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT '625542421' AS product_code, 163.636364 AS output_per_hour
UNION ALL
SELECT '625542431' AS product_code, 200.000000 AS output_per_hour
UNION ALL
SELECT '625543311' AS product_code, 200.000000 AS output_per_hour
UNION ALL
SELECT '6A3-0977' AS product_code, 90.000000 AS output_per_hour
UNION ALL
SELECT 'D0006E' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'D000PK' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'D0015U' AS product_code, 65.454545 AS output_per_hour
UNION ALL
SELECT 'D0016D' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'D0016H' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'D0016M' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'DOO2SS' AS product_code, 225.000000 AS output_per_hour
UNION ALL
SELECT 'Fl4-5091' AS product_code, 80.000000 AS output_per_hour
UNION ALL
SELECT 'Fl4-5092' AS product_code, 80.000000 AS output_per_hour
UNION ALL
SELECT 'LEH123' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'LEH125' AS product_code, 144.000000 AS output_per_hour
UNION ALL
SELECT 'LF5243' AS product_code, 60.000000 AS output_per_hour
UNION ALL
SELECT 'LY9276' AS product_code, 360.000000 AS output_per_hour
UNION ALL
SELECT 'MA3-0575' AS product_code, 105.882353 AS output_per_hour
UNION ALL
SELECT 'P10255004' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P27678011' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P28596001' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P32679023' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P45840001' AS product_code, 65.454545 AS output_per_hour
UNION ALL
SELECT 'P49746004' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P57049906' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P57692402' AS product_code, 69.230769 AS output_per_hour
UNION ALL
SELECT 'P58966900' AS product_code, 65.454545 AS output_per_hour
UNION ALL
SELECT 'P62830603' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'P66869902' AS product_code, 70.588235 AS output_per_hour
UNION ALL
SELECT 'QC2-9149' AS product_code, 360.000000 AS output_per_hour
UNION ALL
SELECT 'QC3-2556' AS product_code, 257.142857 AS output_per_hour
UNION ALL
SELECT 'QC3-2801' AS product_code, 257.142857 AS output_per_hour
UNION ALL
SELECT 'QC4-2821' AS product_code, 138.461538 AS output_per_hour
UNION ALL
SELECT 'QC4-2822' AS product_code, 124.137931 AS output_per_hour
UNION ALL
SELECT 'QC4-6262' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC4-7133' AS product_code, 276.923077 AS output_per_hour
UNION ALL
SELECT 'QC4-7630' AS product_code, 78.260870 AS output_per_hour
UNION ALL
SELECT 'QC4-7960' AS product_code, 276.923077 AS output_per_hour
UNION ALL
SELECT 'QC4-8484' AS product_code, 138.461538 AS output_per_hour
UNION ALL
SELECT 'QC4-8485' AS product_code, 124.137931 AS output_per_hour
UNION ALL
SELECT 'QC5-1030' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-1080' AS product_code, 240.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-1090' AS product_code, 128.571429 AS output_per_hour
UNION ALL
SELECT 'QC5-1657' AS product_code, 45.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-1660' AS product_code, 45.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-3033' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-3438' AS product_code, 360.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-3880' AS product_code, 276.923077 AS output_per_hour
UNION ALL
SELECT 'QC5-5770' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-5861' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-9565' AS product_code, 120.000000 AS output_per_hour
UNION ALL
SELECT 'QC5-9740' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC6-4563' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC6-6773' AS product_code, 15.000000 AS output_per_hour
UNION ALL
SELECT 'QC6-8234' AS product_code, 138.461538 AS output_per_hour
UNION ALL
SELECT 'QC6-8235' AS product_code, 138.461538 AS output_per_hour
UNION ALL
SELECT 'QC7-0598' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6270' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6485' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6486' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6487' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6488' AS product_code, 128.571429 AS output_per_hour
UNION ALL
SELECT 'QC7-6489' AS product_code, 128.571429 AS output_per_hour
UNION ALL
SELECT 'QC7-6490' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6491' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6492' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6493' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6494' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-6495' AS product_code, 180.000000 AS output_per_hour
UNION ALL
SELECT 'QC7-9477' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-1467' AS product_code, 24.657534 AS output_per_hour
UNION ALL
SELECT 'QC8-1470' AS product_code, 24.657534 AS output_per_hour
UNION ALL
SELECT 'QC8-6240' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-6242' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-6328' AS product_code, 45.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-6330' AS product_code, 45.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-6420' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-9503' AS product_code, 90.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-9520' AS product_code, 300.000000 AS output_per_hour
UNION ALL
SELECT 'QC8-9968' AS product_code, 300.000000 AS output_per_hour
) src ON 1=1 WHERE p.process_code='MAI' GROUP BY p.id, src.product_code
ON DUPLICATE KEY UPDATE product_code=VALUES(product_code);

INSERT INTO product_machine_standard_variants (process_id,product_code,machine_code,standard_time_seconds,calculated_output_per_hour,source_name,source_sheet,source_row_number,source_note,is_active)
SELECT p.id,src.product_code,src.machine_code,src.standard_time_seconds,src.output_per_hour,'Book2(3).xlsx','Máy',src.source_row,src.source_note,1 FROM processes p JOIN (
SELECT 'QC5-1657' product_code,'21' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,8 source_row,'540s-570s' source_note
UNION ALL
SELECT 'QC5-1657' product_code,'22' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,8 source_row,'540s-570s' source_note
UNION ALL
SELECT 'QC5-1660' product_code,'21' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,9 source_row,'540s-570s' source_note
UNION ALL
SELECT 'QC5-1660' product_code,'22' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,9 source_row,'540s-570s' source_note
UNION ALL
SELECT 'QC5-1657' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,10 source_row,'Mài 2 khoảng\nmỗi khoảng 2 lần\nLần 1:40s\nLần 2 :40s' source_note
UNION ALL
SELECT 'QC5-1657' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,10 source_row,'Mài 2 khoảng\nmỗi khoảng 2 lần\nLần 1:40s\nLần 2 :40s' source_note
UNION ALL
SELECT 'QC5-1660' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,11 source_row,'Mài 2 khoảng\nmỗi khoảng 2 lần\nLần 1:40s\nLần 2 :40s' source_note
UNION ALL
SELECT 'QC5-1660' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,11 source_row,'Mài 2 khoảng\nmỗi khoảng 2 lần\nLần 1:40s\nLần 2 :40s' source_note
UNION ALL
SELECT 'QC6-6773' product_code,'21' machine_code,240.000000 standard_time_seconds,15.000000 output_per_hour,12 source_row,'210s-240s' source_note
UNION ALL
SELECT 'QC6-6773' product_code,'22' machine_code,240.000000 standard_time_seconds,15.000000 output_per_hour,12 source_row,'210s-240s' source_note
UNION ALL
SELECT 'QC4-7630' product_code,'19' machine_code,46.000000 standard_time_seconds,78.260870 output_per_hour,13 source_row,'45-46s' source_note
UNION ALL
SELECT 'QC4-7630' product_code,'23' machine_code,46.000000 standard_time_seconds,78.260870 output_per_hour,13 source_row,'45-46s' source_note
UNION ALL
SELECT 'QC4-7630' product_code,'24' machine_code,46.000000 standard_time_seconds,78.260870 output_per_hour,13 source_row,'45-46s' source_note
UNION ALL
SELECT 'QC3-2556' product_code,'3' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,14 source_row,'13s-14s' source_note
UNION ALL
SELECT 'QC3-2556' product_code,'5' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,14 source_row,'13s-14s' source_note
UNION ALL
SELECT 'QC3-2801' product_code,'3' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,15 source_row,'13s-14s' source_note
UNION ALL
SELECT 'QC3-2801' product_code,'5' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,15 source_row,'13s-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'3' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,16 source_row,'13s-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'5' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,16 source_row,'13s-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'1' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'2' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'3' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'4' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'5' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'6' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'8' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'9' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'10' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'11' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row,'12-13 s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'1' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'2' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'3' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'4' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'5' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'6' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'8' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'9' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'10' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'11' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row,'12 -13s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'1' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'2' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'3' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'4' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'5' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'6' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'8' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'9' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'10' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'11' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row,'12.5-13.0 s\n' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row,'11-12s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7133' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC4-7960' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC5-3880' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row,'13-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC4-6262' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-3033' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5861' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-5770' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-1030' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC5-9740' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC6-4563' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-0598' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-9477' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6270' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9968' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-9520' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6420' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6240' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-6242' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row,'14-15s' source_note
UNION ALL
SELECT 'QC8-9503' product_code,'19' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row,'Lần 1 :20s\nLần 2 :20s' source_note
UNION ALL
SELECT 'QC8-9503' product_code,'27' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row,'Lần 1 :20s\nLần 2 :20s' source_note
UNION ALL
SELECT 'QC8-9503' product_code,'28' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row,'Lần 1 :20s\nLần 2 :20s' source_note
UNION ALL
SELECT 'QC8-9503' product_code,'29' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row,'Lần 1 :20s\nLần 2 :20s' source_note
UNION ALL
SELECT 'QC8-9503' product_code,'30' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row,'Lần 1 :20s\nLần 2 :20s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'19' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'23' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'24' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'25' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'26' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'27' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'28' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'29' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5091' product_code,'30' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'19' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'23' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'24' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'25' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'26' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'27' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'28' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'29' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'Fl4-5092' product_code,'30' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row,'40-45s' source_note
UNION ALL
SELECT 'MA3-0575' product_code,'19' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row,'Lần 1:10-12s\nLần 2:20-22s' source_note
UNION ALL
SELECT 'MA3-0575' product_code,'27' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row,'Lần 1:10-12s\nLần 2:20-22s' source_note
UNION ALL
SELECT 'MA3-0575' product_code,'28' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row,'Lần 1:10-12s\nLần 2:20-22s' source_note
UNION ALL
SELECT 'MA3-0575' product_code,'29' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row,'Lần 1:10-12s\nLần 2:20-22s' source_note
UNION ALL
SELECT 'MA3-0575' product_code,'30' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row,'Lần 1:10-12s\nLần 2:20-22s' source_note
UNION ALL
SELECT '6A3-0977' product_code,'19' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row,'40s' source_note
UNION ALL
SELECT '6A3-0977' product_code,'27' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row,'40s' source_note
UNION ALL
SELECT '6A3-0977' product_code,'28' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row,'40s' source_note
UNION ALL
SELECT '6A3-0977' product_code,'29' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row,'40s' source_note
UNION ALL
SELECT '6A3-0977' product_code,'30' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row,'40s' source_note
UNION ALL
SELECT 'QC5-9565' product_code,'19' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row,'Khoảng 1 :14-15s\nKhoảng 1 :14-15s' source_note
UNION ALL
SELECT 'QC5-9565' product_code,'27' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row,'Khoảng 1 :14-15s\nKhoảng 1 :14-15s' source_note
UNION ALL
SELECT 'QC5-9565' product_code,'28' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row,'Khoảng 1 :14-15s\nKhoảng 1 :14-15s' source_note
UNION ALL
SELECT 'QC5-9565' product_code,'29' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row,'Khoảng 1 :14-15s\nKhoảng 1 :14-15s' source_note
UNION ALL
SELECT 'QC5-9565' product_code,'31' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row,'Khoảng 1 :14-15s\nKhoảng 1 :14-15s' source_note
UNION ALL
SELECT 'QC8-1467' product_code,'29' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,59 source_row,'Khoảng 1 :Lần 1 :44s\nLần 2:29s\nKhoảng 2 :Lần 1:44s\nLần 2:29s' source_note
UNION ALL
SELECT 'QC8-1467' product_code,'30' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,59 source_row,'Khoảng 1 :Lần 1 :44s\nLần 2:29s\nKhoảng 2 :Lần 1:44s\nLần 2:29s' source_note
UNION ALL
SELECT 'QC8-1470' product_code,'29' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,60 source_row,'Khoảng 1 :Lần 1 :44s\nLần 2:29s\nKhoảng 2 :Lần 1:44s\nLần 2:29s' source_note
UNION ALL
SELECT 'QC8-1470' product_code,'30' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,60 source_row,'Khoảng 1 :Lần 1 :44s\nLần 2:29s\nKhoảng 2 :Lần 1:44s\nLần 2:29s' source_note
UNION ALL
SELECT 'QC5-3438' product_code,'19' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,61 source_row,'9~10 s' source_note
UNION ALL
SELECT 'QC5-3438' product_code,'23' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,61 source_row,'9~10 s' source_note
UNION ALL
SELECT 'QC5-3438' product_code,'24' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,61 source_row,'9~10 s' source_note
UNION ALL
SELECT 'QC2-9149' product_code,'8' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,62 source_row,'10-11s' source_note
UNION ALL
SELECT 'QC5-1080' product_code,'4' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,63 source_row,'12~15 s' source_note
UNION ALL
SELECT 'QC4-8484' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-8484' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-8484' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-8484' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-8484' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-8484' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-8485' product_code,'13' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC4-8485' product_code,'14' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC4-8485' product_code,'17' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC4-8485' product_code,'18' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC4-8485' product_code,'21' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC4-8485' product_code,'22' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC4-2821' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-2821' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-2821' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-2821' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-2821' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-2821' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row,'24~26 s' source_note
UNION ALL
SELECT 'QC4-2822' product_code,'13' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row,'27~29 s' source_note
UNION ALL
SELECT 'QC4-2822' product_code,'14' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row,'27~29 s' source_note
UNION ALL
SELECT 'QC4-2822' product_code,'17' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row,'27~29 s' source_note
UNION ALL
SELECT 'QC4-2822' product_code,'18' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row,'27~29 s' source_note
UNION ALL
SELECT 'QC4-2822' product_code,'21' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row,'27~29 s' source_note
UNION ALL
SELECT 'QC4-2822' product_code,'22' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row,'27~29 s' source_note
UNION ALL
SELECT 'QC5-1090' product_code,'13' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row,'28s' source_note
UNION ALL
SELECT 'QC5-1090' product_code,'14' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row,'28s' source_note
UNION ALL
SELECT 'QC5-1090' product_code,'17' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row,'28s' source_note
UNION ALL
SELECT 'QC5-1090' product_code,'18' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row,'28s' source_note
UNION ALL
SELECT 'QC5-1090' product_code,'21' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row,'28s' source_note
UNION ALL
SELECT 'QC5-1090' product_code,'22' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row,'28s' source_note
UNION ALL
SELECT 'QC6-8234' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8234' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8234' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8234' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8234' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8234' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8235' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8235' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8235' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8235' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8235' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row,'24-26s' source_note
UNION ALL
SELECT 'QC6-8235' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row,'24-26s' source_note
UNION ALL
SELECT 'LF5243' product_code,'13' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row,'55-60s' source_note
UNION ALL
SELECT 'LF5243' product_code,'14' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row,'55-60s' source_note
UNION ALL
SELECT 'LF5243' product_code,'15' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row,'55-60s' source_note
UNION ALL
SELECT 'LF5243' product_code,'16' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row,'55-60s' source_note
UNION ALL
SELECT 'LF5243' product_code,'17' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row,'55-60s' source_note
UNION ALL
SELECT 'LF5243' product_code,'18' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row,'55-60s' source_note
UNION ALL
SELECT 'D0015U' product_code,'13' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row,'50-55s' source_note
UNION ALL
SELECT 'D0015U' product_code,'14' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row,'50-55s' source_note
UNION ALL
SELECT 'D0015U' product_code,'15' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row,'50-55s' source_note
UNION ALL
SELECT 'D0015U' product_code,'16' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row,'50-55s' source_note
UNION ALL
SELECT 'D0015U' product_code,'17' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row,'50-55s' source_note
UNION ALL
SELECT 'D0015U' product_code,'18' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row,'50-55s' source_note
UNION ALL
SELECT 'LEH123' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH123' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH123' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH123' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH123' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH123' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH125' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH125' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH125' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH125' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH125' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row,'14-16s' source_note
UNION ALL
SELECT 'LEH125' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016M' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016M' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016M' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016M' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016M' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016M' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016D' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016D' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016D' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016D' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016D' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016D' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row,'14-16s' source_note
UNION ALL
SELECT 'D000PK' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row,'14-16s' source_note
UNION ALL
SELECT 'D000PK' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row,'14-16s' source_note
UNION ALL
SELECT 'D000PK' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row,'14-16s' source_note
UNION ALL
SELECT 'D000PK' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row,'14-16s' source_note
UNION ALL
SELECT 'D000PK' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row,'14-16s' source_note
UNION ALL
SELECT 'D000PK' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row,'14-16s' source_note
UNION ALL
SELECT 'D0016H' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row,'12-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row,'12-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row,'12-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row,'12-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row,'12-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row,'12-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row,'20-25s' source_note
UNION ALL
SELECT 'D0006E' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row,'20-25s' source_note
UNION ALL
SELECT 'D0006E' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row,'20-25s' source_note
UNION ALL
SELECT 'D0006E' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row,'20-25s' source_note
UNION ALL
SELECT 'D0006E' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row,'20-25s' source_note
UNION ALL
SELECT 'D0006E' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row,'20-25s' source_note
UNION ALL
SELECT 'LY9276' product_code,'20' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row,'5-10s' source_note
UNION ALL
SELECT 'LY9276' product_code,'15' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row,'5-10s' source_note
UNION ALL
SELECT 'LY9276' product_code,'16' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row,'5-10s' source_note
UNION ALL
SELECT 'LY9276' product_code,'7' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row,'5-10s' source_note
UNION ALL
SELECT 'LY9276' product_code,'12' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row,'5-10s' source_note
UNION ALL
SELECT 'LY9276' product_code,'19' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row,'5-10s' source_note
UNION ALL
SELECT 'DOO2SS' product_code,'20' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row,'8-16s' source_note
UNION ALL
SELECT 'DOO2SS' product_code,'15' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row,'8-16s' source_note
UNION ALL
SELECT 'DOO2SS' product_code,'16' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row,'8-16s' source_note
UNION ALL
SELECT 'DOO2SS' product_code,'7' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row,'8-16s' source_note
UNION ALL
SELECT 'DOO2SS' product_code,'12' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row,'8-16s' source_note
UNION ALL
SELECT 'DOO2SS' product_code,'19' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row,'8-16s' source_note
UNION ALL
SELECT 'LEH123' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH123' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'LEH125' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016M' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016D' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D000PK' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0016H' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'D0006E' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row,'11-13s' source_note
UNION ALL
SELECT 'P28596001' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,89 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P28596001' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,89 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P27678011' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,90 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P27678011' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,90 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P10255004' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,91 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P10255004' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,91 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P45840001' product_code,'13' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,92 source_row,'Lần 1:34-35s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P45840001' product_code,'18' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,92 source_row,'Lần 1:34-35s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P57692402' product_code,'13' machine_code,52.000000 standard_time_seconds,69.230769 output_per_hour,93 source_row,'Lần 1:31-32s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P57692402' product_code,'18' machine_code,52.000000 standard_time_seconds,69.230769 output_per_hour,93 source_row,'Lần 1:31-32s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P57049906' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,94 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P57049906' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,94 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P58966900' product_code,'13' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,95 source_row,'Lần 1:34-35s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P58966900' product_code,'18' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,95 source_row,'Lần 1:34-35s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P62830603' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,96 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P62830603' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,96 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P66869902' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,97 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P66869902' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,97 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P49746004' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,98 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P49746004' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,98 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P32679023' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,99 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'P32679023' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,99 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT '30375120' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,100 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT '30375120' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,100 source_row,'Lần 1:30-31s\nLần 2:22-25s' source_note
UNION ALL
SELECT 'QC7-6485' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row,'18-20 s' source_note
UNION ALL
SELECT 'QC7-6485' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row,'18-20 s' source_note
UNION ALL
SELECT 'QC7-6485' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row,'18-20 s' source_note
UNION ALL
SELECT 'QC7-6485' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row,'18-20 s' source_note
UNION ALL
SELECT 'QC7-6486' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6486' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6486' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6486' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6487' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6487' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6487' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6487' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6488' product_code,'27' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6488' product_code,'28' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6488' product_code,'29' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6488' product_code,'30' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6489' product_code,'27' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6489' product_code,'28' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6489' product_code,'29' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6489' product_code,'30' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row,'24-28 s' source_note
UNION ALL
SELECT 'QC7-6490' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row,'13-15s' source_note
UNION ALL
SELECT 'QC7-6490' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row,'13-15s' source_note
UNION ALL
SELECT 'QC7-6490' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row,'13-15s' source_note
UNION ALL
SELECT 'QC7-6490' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row,'13-15s' source_note
UNION ALL
SELECT 'QC7-6491' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6491' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6491' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6491' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6492' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6492' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6492' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6492' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6493' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6493' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6493' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6493' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6494' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6494' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6494' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6494' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6495' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6495' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6495' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row,'12-14s' source_note
UNION ALL
SELECT 'QC7-6495' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row,'12-14s' source_note
UNION ALL
SELECT '625542421' product_code,'14' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,112 source_row,'20-22 s' source_note
UNION ALL
SELECT '625542421' product_code,'17' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,112 source_row,'20-22 s' source_note
UNION ALL
SELECT '625542431' product_code,'14' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,113 source_row,'16-18 s' source_note
UNION ALL
SELECT '625542431' product_code,'17' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,113 source_row,'16-18 s' source_note
UNION ALL
SELECT '625543311' product_code,'14' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,114 source_row,'16-18 s' source_note
UNION ALL
SELECT '625543311' product_code,'17' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,114 source_row,'16-18 s' source_note
UNION ALL
SELECT '625543311' product_code,'19' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row,'20-22 s' source_note
UNION ALL
SELECT '625543311' product_code,'27' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row,'20-22 s' source_note
UNION ALL
SELECT '625543311' product_code,'28' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row,'20-22 s' source_note
UNION ALL
SELECT '625543311' product_code,'29' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row,'20-22 s' source_note
UNION ALL
SELECT '625543311' product_code,'30' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row,'20-22 s' source_note
UNION ALL
SELECT 'QC8-6328' product_code,'19' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6328' product_code,'27' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6328' product_code,'28' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6328' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6328' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6330' product_code,'19' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6330' product_code,'27' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6330' product_code,'28' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6330' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row,'80s' source_note
UNION ALL
SELECT 'QC8-6330' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row,'80s' source_note
) src ON 1=1 WHERE p.process_code='MAI'
ON DUPLICATE KEY UPDATE standard_time_seconds=VALUES(standard_time_seconds),calculated_output_per_hour=VALUES(calculated_output_per_hour),source_note=VALUES(source_note),is_active=1;

INSERT INTO product_machine_standards (process_id,product_code,machine_id,standard_output,standard_time_seconds,calculated_output_per_hour,source_name,source_row_number,effective_from,effective_to,is_active)
SELECT p.id,src.product_code,m.id,src.output_per_hour,src.standard_time_seconds,src.output_per_hour,'Book2(3).xlsx',src.source_row,DATE('2026-08-10'),NULL,1 FROM processes p JOIN (
SELECT '30375120' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,100 source_row
UNION ALL
SELECT '30375120' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,100 source_row
UNION ALL
SELECT '625542421' product_code,'14' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,112 source_row
UNION ALL
SELECT '625542421' product_code,'17' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,112 source_row
UNION ALL
SELECT '625542431' product_code,'14' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,113 source_row
UNION ALL
SELECT '625542431' product_code,'17' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,113 source_row
UNION ALL
SELECT '625543311' product_code,'14' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,114 source_row
UNION ALL
SELECT '625543311' product_code,'17' machine_code,18.000000 standard_time_seconds,200.000000 output_per_hour,114 source_row
UNION ALL
SELECT '625543311' product_code,'19' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row
UNION ALL
SELECT '625543311' product_code,'27' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row
UNION ALL
SELECT '625543311' product_code,'28' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row
UNION ALL
SELECT '625543311' product_code,'29' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row
UNION ALL
SELECT '625543311' product_code,'30' machine_code,22.000000 standard_time_seconds,163.636364 output_per_hour,115 source_row
UNION ALL
SELECT '6A3-0977' product_code,'19' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row
UNION ALL
SELECT '6A3-0977' product_code,'27' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row
UNION ALL
SELECT '6A3-0977' product_code,'28' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row
UNION ALL
SELECT '6A3-0977' product_code,'29' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row
UNION ALL
SELECT '6A3-0977' product_code,'30' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,57 source_row
UNION ALL
SELECT 'D0006E' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row
UNION ALL
SELECT 'D0006E' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row
UNION ALL
SELECT 'D0006E' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row
UNION ALL
SELECT 'D0006E' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row
UNION ALL
SELECT 'D0006E' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row
UNION ALL
SELECT 'D0006E' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,79 source_row
UNION ALL
SELECT 'D0006E' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D0006E' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,88 source_row
UNION ALL
SELECT 'D000PK' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row
UNION ALL
SELECT 'D000PK' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row
UNION ALL
SELECT 'D000PK' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row
UNION ALL
SELECT 'D000PK' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row
UNION ALL
SELECT 'D000PK' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row
UNION ALL
SELECT 'D000PK' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,77 source_row
UNION ALL
SELECT 'D000PK' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D000PK' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,86 source_row
UNION ALL
SELECT 'D0015U' product_code,'13' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row
UNION ALL
SELECT 'D0015U' product_code,'14' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row
UNION ALL
SELECT 'D0015U' product_code,'15' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row
UNION ALL
SELECT 'D0015U' product_code,'16' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row
UNION ALL
SELECT 'D0015U' product_code,'17' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row
UNION ALL
SELECT 'D0015U' product_code,'18' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,72 source_row
UNION ALL
SELECT 'D0016D' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row
UNION ALL
SELECT 'D0016D' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row
UNION ALL
SELECT 'D0016D' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row
UNION ALL
SELECT 'D0016D' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row
UNION ALL
SELECT 'D0016D' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row
UNION ALL
SELECT 'D0016D' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,76 source_row
UNION ALL
SELECT 'D0016D' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016D' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,85 source_row
UNION ALL
SELECT 'D0016H' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row
UNION ALL
SELECT 'D0016H' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row
UNION ALL
SELECT 'D0016H' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row
UNION ALL
SELECT 'D0016H' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row
UNION ALL
SELECT 'D0016H' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row
UNION ALL
SELECT 'D0016H' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,78 source_row
UNION ALL
SELECT 'D0016H' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016H' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,87 source_row
UNION ALL
SELECT 'D0016M' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row
UNION ALL
SELECT 'D0016M' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row
UNION ALL
SELECT 'D0016M' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row
UNION ALL
SELECT 'D0016M' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row
UNION ALL
SELECT 'D0016M' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row
UNION ALL
SELECT 'D0016M' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,75 source_row
UNION ALL
SELECT 'D0016M' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'D0016M' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,84 source_row
UNION ALL
SELECT 'DOO2SS' product_code,'7' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row
UNION ALL
SELECT 'DOO2SS' product_code,'12' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row
UNION ALL
SELECT 'DOO2SS' product_code,'15' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row
UNION ALL
SELECT 'DOO2SS' product_code,'16' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row
UNION ALL
SELECT 'DOO2SS' product_code,'19' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row
UNION ALL
SELECT 'DOO2SS' product_code,'20' machine_code,16.000000 standard_time_seconds,225.000000 output_per_hour,81 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'19' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'23' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'24' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'25' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'26' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'27' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'28' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'29' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5091' product_code,'30' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,54 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'19' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'23' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'24' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'25' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'26' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'27' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'28' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'29' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'Fl4-5092' product_code,'30' machine_code,45.000000 standard_time_seconds,80.000000 output_per_hour,55 source_row
UNION ALL
SELECT 'LEH123' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row
UNION ALL
SELECT 'LEH123' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row
UNION ALL
SELECT 'LEH123' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row
UNION ALL
SELECT 'LEH123' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row
UNION ALL
SELECT 'LEH123' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row
UNION ALL
SELECT 'LEH123' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,73 source_row
UNION ALL
SELECT 'LEH123' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH123' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,82 source_row
UNION ALL
SELECT 'LEH125' product_code,'7' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'12' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'13' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row
UNION ALL
SELECT 'LEH125' product_code,'14' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row
UNION ALL
SELECT 'LEH125' product_code,'15' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row
UNION ALL
SELECT 'LEH125' product_code,'16' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row
UNION ALL
SELECT 'LEH125' product_code,'17' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row
UNION ALL
SELECT 'LEH125' product_code,'18' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,74 source_row
UNION ALL
SELECT 'LEH125' product_code,'19' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'20' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'23' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'24' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'25' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LEH125' product_code,'26' machine_code,25.000000 standard_time_seconds,144.000000 output_per_hour,83 source_row
UNION ALL
SELECT 'LF5243' product_code,'13' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row
UNION ALL
SELECT 'LF5243' product_code,'14' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row
UNION ALL
SELECT 'LF5243' product_code,'15' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row
UNION ALL
SELECT 'LF5243' product_code,'16' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row
UNION ALL
SELECT 'LF5243' product_code,'17' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row
UNION ALL
SELECT 'LF5243' product_code,'18' machine_code,60.000000 standard_time_seconds,60.000000 output_per_hour,71 source_row
UNION ALL
SELECT 'LY9276' product_code,'7' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row
UNION ALL
SELECT 'LY9276' product_code,'12' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row
UNION ALL
SELECT 'LY9276' product_code,'15' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row
UNION ALL
SELECT 'LY9276' product_code,'16' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row
UNION ALL
SELECT 'LY9276' product_code,'19' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row
UNION ALL
SELECT 'LY9276' product_code,'20' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,80 source_row
UNION ALL
SELECT 'MA3-0575' product_code,'19' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row
UNION ALL
SELECT 'MA3-0575' product_code,'27' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row
UNION ALL
SELECT 'MA3-0575' product_code,'28' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row
UNION ALL
SELECT 'MA3-0575' product_code,'29' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row
UNION ALL
SELECT 'MA3-0575' product_code,'30' machine_code,34.000000 standard_time_seconds,105.882353 output_per_hour,56 source_row
UNION ALL
SELECT 'P10255004' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,91 source_row
UNION ALL
SELECT 'P10255004' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,91 source_row
UNION ALL
SELECT 'P27678011' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,90 source_row
UNION ALL
SELECT 'P27678011' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,90 source_row
UNION ALL
SELECT 'P28596001' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,89 source_row
UNION ALL
SELECT 'P28596001' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,89 source_row
UNION ALL
SELECT 'P32679023' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,99 source_row
UNION ALL
SELECT 'P32679023' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,99 source_row
UNION ALL
SELECT 'P45840001' product_code,'13' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,92 source_row
UNION ALL
SELECT 'P45840001' product_code,'18' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,92 source_row
UNION ALL
SELECT 'P49746004' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,98 source_row
UNION ALL
SELECT 'P49746004' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,98 source_row
UNION ALL
SELECT 'P57049906' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,94 source_row
UNION ALL
SELECT 'P57049906' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,94 source_row
UNION ALL
SELECT 'P57692402' product_code,'13' machine_code,52.000000 standard_time_seconds,69.230769 output_per_hour,93 source_row
UNION ALL
SELECT 'P57692402' product_code,'18' machine_code,52.000000 standard_time_seconds,69.230769 output_per_hour,93 source_row
UNION ALL
SELECT 'P58966900' product_code,'13' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,95 source_row
UNION ALL
SELECT 'P58966900' product_code,'18' machine_code,55.000000 standard_time_seconds,65.454545 output_per_hour,95 source_row
UNION ALL
SELECT 'P62830603' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,96 source_row
UNION ALL
SELECT 'P62830603' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,96 source_row
UNION ALL
SELECT 'P66869902' product_code,'13' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,97 source_row
UNION ALL
SELECT 'P66869902' product_code,'18' machine_code,51.000000 standard_time_seconds,70.588235 output_per_hour,97 source_row
UNION ALL
SELECT 'QC2-9149' product_code,'8' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,62 source_row
UNION ALL
SELECT 'QC3-2556' product_code,'3' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,14 source_row
UNION ALL
SELECT 'QC3-2556' product_code,'5' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,14 source_row
UNION ALL
SELECT 'QC3-2801' product_code,'3' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,15 source_row
UNION ALL
SELECT 'QC3-2801' product_code,'5' machine_code,14.000000 standard_time_seconds,257.142857 output_per_hour,15 source_row
UNION ALL
SELECT 'QC4-2821' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row
UNION ALL
SELECT 'QC4-2821' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row
UNION ALL
SELECT 'QC4-2821' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row
UNION ALL
SELECT 'QC4-2821' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row
UNION ALL
SELECT 'QC4-2821' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row
UNION ALL
SELECT 'QC4-2821' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,66 source_row
UNION ALL
SELECT 'QC4-2822' product_code,'13' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row
UNION ALL
SELECT 'QC4-2822' product_code,'14' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row
UNION ALL
SELECT 'QC4-2822' product_code,'17' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row
UNION ALL
SELECT 'QC4-2822' product_code,'18' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row
UNION ALL
SELECT 'QC4-2822' product_code,'21' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row
UNION ALL
SELECT 'QC4-2822' product_code,'22' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,67 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,20 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-6262' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,38 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'1' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'2' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'3' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'4' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'5' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'6' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'8' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'9' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'10' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'11' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,17 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7133' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,35 source_row
UNION ALL
SELECT 'QC4-7630' product_code,'19' machine_code,46.000000 standard_time_seconds,78.260870 output_per_hour,13 source_row
UNION ALL
SELECT 'QC4-7630' product_code,'23' machine_code,46.000000 standard_time_seconds,78.260870 output_per_hour,13 source_row
UNION ALL
SELECT 'QC4-7630' product_code,'24' machine_code,46.000000 standard_time_seconds,78.260870 output_per_hour,13 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'1' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'2' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'3' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'4' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'5' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'6' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'8' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'9' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'10' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'11' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,18 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-7960' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,36 source_row
UNION ALL
SELECT 'QC4-8484' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row
UNION ALL
SELECT 'QC4-8484' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row
UNION ALL
SELECT 'QC4-8484' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row
UNION ALL
SELECT 'QC4-8484' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row
UNION ALL
SELECT 'QC4-8484' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row
UNION ALL
SELECT 'QC4-8484' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,64 source_row
UNION ALL
SELECT 'QC4-8485' product_code,'13' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row
UNION ALL
SELECT 'QC4-8485' product_code,'14' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row
UNION ALL
SELECT 'QC4-8485' product_code,'17' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row
UNION ALL
SELECT 'QC4-8485' product_code,'18' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row
UNION ALL
SELECT 'QC4-8485' product_code,'21' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row
UNION ALL
SELECT 'QC4-8485' product_code,'22' machine_code,29.000000 standard_time_seconds,124.137931 output_per_hour,65 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,24 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1030' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,42 source_row
UNION ALL
SELECT 'QC5-1080' product_code,'4' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,63 source_row
UNION ALL
SELECT 'QC5-1090' product_code,'13' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row
UNION ALL
SELECT 'QC5-1090' product_code,'14' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row
UNION ALL
SELECT 'QC5-1090' product_code,'17' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row
UNION ALL
SELECT 'QC5-1090' product_code,'18' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row
UNION ALL
SELECT 'QC5-1090' product_code,'21' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row
UNION ALL
SELECT 'QC5-1090' product_code,'22' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,68 source_row
UNION ALL
SELECT 'QC5-1657' product_code,'21' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,8 source_row
UNION ALL
SELECT 'QC5-1657' product_code,'22' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,8 source_row
UNION ALL
SELECT 'QC5-1657' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,10 source_row
UNION ALL
SELECT 'QC5-1657' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,10 source_row
UNION ALL
SELECT 'QC5-1660' product_code,'21' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,9 source_row
UNION ALL
SELECT 'QC5-1660' product_code,'22' machine_code,570.000000 standard_time_seconds,6.315789 output_per_hour,9 source_row
UNION ALL
SELECT 'QC5-1660' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,11 source_row
UNION ALL
SELECT 'QC5-1660' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,11 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,21 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3033' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,39 source_row
UNION ALL
SELECT 'QC5-3438' product_code,'19' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,61 source_row
UNION ALL
SELECT 'QC5-3438' product_code,'23' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,61 source_row
UNION ALL
SELECT 'QC5-3438' product_code,'24' machine_code,10.000000 standard_time_seconds,360.000000 output_per_hour,61 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'1' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'2' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'3' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'4' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'5' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'6' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'8' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'9' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'10' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'11' machine_code,13.000000 standard_time_seconds,276.923077 output_per_hour,19 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-3880' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,37 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,23 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5770' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,41 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,22 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-5861' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,40 source_row
UNION ALL
SELECT 'QC5-9565' product_code,'19' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row
UNION ALL
SELECT 'QC5-9565' product_code,'27' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row
UNION ALL
SELECT 'QC5-9565' product_code,'28' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row
UNION ALL
SELECT 'QC5-9565' product_code,'29' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row
UNION ALL
SELECT 'QC5-9565' product_code,'31' machine_code,30.000000 standard_time_seconds,120.000000 output_per_hour,58 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,25 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC5-9740' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,43 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,26 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-4563' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,44 source_row
UNION ALL
SELECT 'QC6-6773' product_code,'21' machine_code,240.000000 standard_time_seconds,15.000000 output_per_hour,12 source_row
UNION ALL
SELECT 'QC6-6773' product_code,'22' machine_code,240.000000 standard_time_seconds,15.000000 output_per_hour,12 source_row
UNION ALL
SELECT 'QC6-8234' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row
UNION ALL
SELECT 'QC6-8234' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row
UNION ALL
SELECT 'QC6-8234' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row
UNION ALL
SELECT 'QC6-8234' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row
UNION ALL
SELECT 'QC6-8234' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row
UNION ALL
SELECT 'QC6-8234' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,69 source_row
UNION ALL
SELECT 'QC6-8235' product_code,'13' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row
UNION ALL
SELECT 'QC6-8235' product_code,'14' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row
UNION ALL
SELECT 'QC6-8235' product_code,'17' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row
UNION ALL
SELECT 'QC6-8235' product_code,'18' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row
UNION ALL
SELECT 'QC6-8235' product_code,'21' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row
UNION ALL
SELECT 'QC6-8235' product_code,'22' machine_code,26.000000 standard_time_seconds,138.461538 output_per_hour,70 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,27 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-0598' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,45 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,29 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6270' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,47 source_row
UNION ALL
SELECT 'QC7-6485' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row
UNION ALL
SELECT 'QC7-6485' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row
UNION ALL
SELECT 'QC7-6485' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row
UNION ALL
SELECT 'QC7-6485' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,101 source_row
UNION ALL
SELECT 'QC7-6486' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row
UNION ALL
SELECT 'QC7-6486' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row
UNION ALL
SELECT 'QC7-6486' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row
UNION ALL
SELECT 'QC7-6486' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,102 source_row
UNION ALL
SELECT 'QC7-6487' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row
UNION ALL
SELECT 'QC7-6487' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row
UNION ALL
SELECT 'QC7-6487' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row
UNION ALL
SELECT 'QC7-6487' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,103 source_row
UNION ALL
SELECT 'QC7-6488' product_code,'27' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row
UNION ALL
SELECT 'QC7-6488' product_code,'28' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row
UNION ALL
SELECT 'QC7-6488' product_code,'29' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row
UNION ALL
SELECT 'QC7-6488' product_code,'30' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,104 source_row
UNION ALL
SELECT 'QC7-6489' product_code,'27' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row
UNION ALL
SELECT 'QC7-6489' product_code,'28' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row
UNION ALL
SELECT 'QC7-6489' product_code,'29' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row
UNION ALL
SELECT 'QC7-6489' product_code,'30' machine_code,28.000000 standard_time_seconds,128.571429 output_per_hour,105 source_row
UNION ALL
SELECT 'QC7-6490' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row
UNION ALL
SELECT 'QC7-6490' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row
UNION ALL
SELECT 'QC7-6490' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row
UNION ALL
SELECT 'QC7-6490' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,106 source_row
UNION ALL
SELECT 'QC7-6491' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row
UNION ALL
SELECT 'QC7-6491' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row
UNION ALL
SELECT 'QC7-6491' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row
UNION ALL
SELECT 'QC7-6491' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,107 source_row
UNION ALL
SELECT 'QC7-6492' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row
UNION ALL
SELECT 'QC7-6492' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row
UNION ALL
SELECT 'QC7-6492' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row
UNION ALL
SELECT 'QC7-6492' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,108 source_row
UNION ALL
SELECT 'QC7-6493' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row
UNION ALL
SELECT 'QC7-6493' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row
UNION ALL
SELECT 'QC7-6493' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row
UNION ALL
SELECT 'QC7-6493' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,109 source_row
UNION ALL
SELECT 'QC7-6494' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row
UNION ALL
SELECT 'QC7-6494' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row
UNION ALL
SELECT 'QC7-6494' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row
UNION ALL
SELECT 'QC7-6494' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,110 source_row
UNION ALL
SELECT 'QC7-6495' product_code,'27' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row
UNION ALL
SELECT 'QC7-6495' product_code,'28' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row
UNION ALL
SELECT 'QC7-6495' product_code,'29' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row
UNION ALL
SELECT 'QC7-6495' product_code,'30' machine_code,20.000000 standard_time_seconds,180.000000 output_per_hour,111 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,28 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC7-9477' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,46 source_row
UNION ALL
SELECT 'QC8-1467' product_code,'29' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,59 source_row
UNION ALL
SELECT 'QC8-1467' product_code,'30' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,59 source_row
UNION ALL
SELECT 'QC8-1470' product_code,'29' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,60 source_row
UNION ALL
SELECT 'QC8-1470' product_code,'30' machine_code,146.000000 standard_time_seconds,24.657534 output_per_hour,60 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,33 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6240' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,51 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,34 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6242' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,52 source_row
UNION ALL
SELECT 'QC8-6328' product_code,'19' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row
UNION ALL
SELECT 'QC8-6328' product_code,'27' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row
UNION ALL
SELECT 'QC8-6328' product_code,'28' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row
UNION ALL
SELECT 'QC8-6328' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row
UNION ALL
SELECT 'QC8-6328' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,116 source_row
UNION ALL
SELECT 'QC8-6330' product_code,'19' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row
UNION ALL
SELECT 'QC8-6330' product_code,'27' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row
UNION ALL
SELECT 'QC8-6330' product_code,'28' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row
UNION ALL
SELECT 'QC8-6330' product_code,'29' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row
UNION ALL
SELECT 'QC8-6330' product_code,'30' machine_code,80.000000 standard_time_seconds,45.000000 output_per_hour,117 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,32 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-6420' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,50 source_row
UNION ALL
SELECT 'QC8-9503' product_code,'19' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row
UNION ALL
SELECT 'QC8-9503' product_code,'27' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row
UNION ALL
SELECT 'QC8-9503' product_code,'28' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row
UNION ALL
SELECT 'QC8-9503' product_code,'29' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row
UNION ALL
SELECT 'QC8-9503' product_code,'30' machine_code,40.000000 standard_time_seconds,90.000000 output_per_hour,53 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,31 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9520' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,49 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'1' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'2' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'3' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'4' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'5' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'6' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'8' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'9' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'10' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'11' machine_code,12.000000 standard_time_seconds,300.000000 output_per_hour,30 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'19' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'23' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'24' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'25' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'26' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'27' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'28' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'29' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
UNION ALL
SELECT 'QC8-9968' product_code,'30' machine_code,15.000000 standard_time_seconds,240.000000 output_per_hour,48 source_row
) src ON 1=1 JOIN machines m ON m.process_id=p.id AND UPPER(TRIM(m.machine_code))=UPPER(src.machine_code) WHERE p.process_code='MAI'
ON DUPLICATE KEY UPDATE standard_output=VALUES(standard_output),standard_time_seconds=VALUES(standard_time_seconds),calculated_output_per_hour=VALUES(calculated_output_per_hour),source_name=VALUES(source_name),source_row_number=VALUES(source_row_number),effective_to=NULL,is_active=1;

SELECT COUNT(*) AS so_bien_the_book2 FROM product_machine_standard_variants v JOIN processes p ON p.id=v.process_id WHERE p.process_code='MAI' AND v.source_name='Book2(3).xlsx';
SELECT COUNT(*) AS so_dinh_muc_may_dang_dung FROM product_machine_standards pms JOIN processes p ON p.id=pms.process_id WHERE p.process_code='MAI' AND pms.is_active=1 AND pms.source_name='Book2(3).xlsx';