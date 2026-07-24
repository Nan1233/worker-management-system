-- Chuẩn hóa toàn bộ cột định mức thành số nguyên.
-- Chạy một lần trên TiDB/MySQL trước khi deploy phiên bản mới.

UPDATE product_standards
SET standard_output = GREATEST(1, ROUND(COALESCE(standard_output, 1)));

UPDATE production_reports_temp
SET standard_output = GREATEST(0, ROUND(COALESCE(standard_output, 0)));

UPDATE production_reports
SET standard_output = GREATEST(0, ROUND(COALESCE(standard_output, 0)));

ALTER TABLE product_standards
  MODIFY COLUMN standard_output INT UNSIGNED NOT NULL;

ALTER TABLE production_reports_temp
  MODIFY COLUMN standard_output INT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE production_reports
  MODIFY COLUMN standard_output INT UNSIGNED NOT NULL DEFAULT 0;
