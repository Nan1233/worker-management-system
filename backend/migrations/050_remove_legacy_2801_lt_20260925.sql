-- KTC TEST 050: remove legacy 2801-LT data.
-- Canonical GC master is the 2026-09-24 Excel mapping. It contains 2801 -> QC3-2801;
-- 2801-LT is NOT a canonical product and must not remain selectable or resolvable.
SET @gc_process_id := (
    SELECT id
    FROM processes
    WHERE UPPER(TRIM(process_code)) = 'GC'
    LIMIT 1
);

DELETE pms
FROM product_machine_standards pms
WHERE pms.process_id = @gc_process_id
  AND UPPER(TRIM(pms.product_code)) = '2801-LT';

DELETE psv
FROM product_standard_versions psv
WHERE psv.process_id = @gc_process_id
  AND UPPER(TRIM(psv.product_code)) = '2801-LT';

DELETE ps
FROM product_standards ps
WHERE ps.process_id = @gc_process_id
  AND UPPER(TRIM(ps.product_code)) = '2801-LT';
