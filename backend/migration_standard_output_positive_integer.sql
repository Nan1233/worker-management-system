-- Chuẩn hóa định mức thành số nguyên dương.
-- Hãy sao lưu DB trước khi chạy trên dữ liệu thật.

UPDATE product_standards
SET standard_output = GREATEST(1, ROUND(standard_output))
WHERE standard_output IS NULL
   OR standard_output <= 0
   OR standard_output <> ROUND(standard_output);

ALTER TABLE product_standards
  MODIFY COLUMN standard_output INT UNSIGNED NOT NULL;
