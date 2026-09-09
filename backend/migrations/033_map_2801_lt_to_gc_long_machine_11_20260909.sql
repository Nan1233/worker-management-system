-- KTC: Map Lồng-machine product 2801-LT to GC machine 11.
-- Business rule: 2801-LT is selectable only for Lồng / Máy / machine 11.
-- Standard is already defined by migration 032 (605 units/hour).
-- Resolve machine_id from the canonical machines table instead of hard-coding an ID.

START TRANSACTION;

INSERT INTO product_machine_standards
    (process_id, product_code, machine_id, standard_output, standard_time_seconds,
     calculated_output_per_hour, source_name, source_row_number,
     effective_from, effective_to, is_active)
SELECT
    1,
    '2801-LT',
    m.id,
    605,
    3600 / 605,
    605,
    'KTC Lồng',
    NULL,
    '2026-09-08',
    NULL,
    1
FROM machines m
WHERE m.process_id = 1
  AND TRIM(m.machine_code) = '11'
  AND m.status = 'active'
  AND EXISTS (
      SELECT 1
      FROM product_standards ps
      WHERE ps.process_id = 1
        AND ps.product_code = '2801-LT'
        AND ps.work_type = 'LONG'
        AND ps.status = 'active'
  )
  AND NOT EXISTS (
      SELECT 1
      FROM product_machine_standards pms
      WHERE pms.process_id = 1
        AND pms.product_code = '2801-LT'
        AND pms.machine_id = m.id
        AND pms.is_active = 1
  );

COMMIT;
