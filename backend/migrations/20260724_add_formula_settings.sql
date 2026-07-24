ALTER TABLE machines
ADD COLUMN IF NOT EXISTS exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0
COMMENT '0: tính KQD vào TT; 1: không tính KQD vào TT';

UPDATE product_standards
SET standard_output = ROUND(standard_output)
WHERE standard_output IS NOT NULL;
