-- KTC TEST 051: GC Lồng tay - công việc không có định mức.
-- Các mã này vẫn thuộc process GC để dùng chung form Lồng tay,
-- nhưng không có định mức và không nhập OK/NG.

SET @gc_process_id := (
    SELECT id FROM processes
    WHERE UPPER(TRIM(process_code)) = 'GC'
    LIMIT 1
);

INSERT INTO product_standards
    (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
SELECT @gc_process_id, 'LONG', v.product_code, 0, 1, 'active'
FROM (
    SELECT 'XUATNHAP' AS product_code
    UNION ALL SELECT 'KTCD'
    UNION ALL SELECT 'TAIPP'
) v
WHERE @gc_process_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM product_standards ps
      WHERE ps.process_id = @gc_process_id
        AND UPPER(TRIM(ps.product_code)) = v.product_code
  );

-- Nếu DB đã có bản ghi cũ nhưng sai work_type/định mức/trạng thái thì chuẩn hóa lại.
UPDATE product_standards
SET work_type = 'LONG',
    standard_output = 0,
    exclude_kqd_from_tt = 1,
    status = 'active'
WHERE process_id = @gc_process_id
  AND UPPER(TRIM(product_code)) IN ('XUATNHAP', 'KTCD', 'TAIPP');
