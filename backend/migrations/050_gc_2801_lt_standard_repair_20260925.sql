-- KTC TEST 050: repair the GC 2801-LT machine-standard linkage.
-- 2801-LT is a Lồng product and must resolve against ML1..ML20 only.
SET @gc_process_id := (SELECT id FROM processes WHERE UPPER(TRIM(process_code))='GC' LIMIT 1);

UPDATE product_machine_standards pms
JOIN machines m ON m.id = pms.machine_id
SET pms.is_active = 0
WHERE pms.process_id = @gc_process_id
  AND UPPER(TRIM(pms.product_code)) = '2801-LT'
  AND UPPER(TRIM(m.machine_code)) NOT REGEXP '^ML[0-9]+$'
  AND pms.is_active = 1;

INSERT INTO product_machine_standards(
    process_id,
    product_code,
    machine_id,
    standard_output,
    standard_time_seconds,
    calculated_output_per_hour,
    source_name,
    effective_from,
    is_active
)
SELECT
    @gc_process_id,
    '2801-LT',
    m.id,
    605,
    3600 / 605,
    605,
    'KTC Lồng',
    '2026-09-08',
    1
FROM machines m
WHERE m.process_id = @gc_process_id
  AND m.status = 'active'
  AND UPPER(TRIM(m.machine_code)) REGEXP '^ML[0-9]+$'
  AND NOT EXISTS (
      SELECT 1
      FROM product_machine_standards pms
      WHERE pms.process_id = @gc_process_id
        AND UPPER(TRIM(pms.product_code)) = '2801-LT'
        AND pms.machine_id = m.id
        AND pms.is_active = 1
  );
