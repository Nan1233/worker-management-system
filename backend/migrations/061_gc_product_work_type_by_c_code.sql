-- GC product classification: C-prefixed display/encoding codes are Cắt products.
-- Non-C product codes belong to Lồng unless they are one of the explicit no-standard jobs.
-- Idempotent UPDATE; no product rows or machine-standard mappings are deleted.
SET @gc_process_id := (SELECT id FROM processes WHERE UPPER(TRIM(process_code)) = 'GC' LIMIT 1);

UPDATE product_standards ps
LEFT JOIN product_aliases pa
  ON pa.process_id = ps.process_id
 AND UPPER(TRIM(pa.product_code)) = UPPER(TRIM(ps.product_code))
 AND pa.status = 'active'
SET ps.work_type = CASE
  WHEN UPPER(TRIM(ps.product_code)) IN ('XUATNHAP', 'KTCD', 'TAIPP') THEN 'Lồng'
  WHEN UPPER(TRIM(COALESCE(pa.alias_code, ''))) LIKE 'C%'
    OR UPPER(TRIM(COALESCE(ps.encoding_code, ''))) LIKE 'C%'
    OR UPPER(TRIM(COALESCE(ps.product_code, ''))) LIKE 'C%' THEN 'Cắt'
  ELSE 'Lồng'
END
WHERE ps.process_id = @gc_process_id
  AND ps.status = 'active'
  AND (
    UPPER(TRIM(COALESCE(ps.work_type, ''))) IN ('CẮT', 'CUT', 'CAT', 'LỒNG', 'LONG', 'LONG TAY')
    OR UPPER(TRIM(ps.product_code)) IN ('XUATNHAP', 'KTCD', 'TAIPP')
  );
