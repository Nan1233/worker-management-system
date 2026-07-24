-- Quy tắc TT không tính KQĐ được cấu hình theo mã sản phẩm, không theo mã máy.
ALTER TABLE product_standards
  ADD COLUMN IF NOT EXISTS exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '0: tính KQD vào TT; 1: không tính KQD vào TT theo mã sản phẩm';

-- Chuyển dữ liệu cũ khi mã máy trùng mã sản phẩm để hạn chế mất cấu hình hiện có.
UPDATE product_standards ps
JOIN machines m
  ON m.process_id = ps.process_id
 AND UPPER(TRIM(m.machine_code)) = UPPER(TRIM(ps.product_code))
SET ps.exclude_kqd_from_tt = COALESCE(m.exclude_kqd_from_tt, 0)
WHERE COALESCE(m.exclude_kqd_from_tt, 0) = 1;

CREATE INDEX IF NOT EXISTS idx_ps_formula_lookup
  ON product_standards(process_id, product_code, status, exclude_kqd_from_tt);
