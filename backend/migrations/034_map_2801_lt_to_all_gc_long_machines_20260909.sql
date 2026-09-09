-- KTC: Make 2801-LT available for Lồng / Máy on every active GC Lồng machine.
-- Business rule: 2801-LT is a Lồng product, not a machine-11-only product.
-- GC Cắt machines use C-prefixed codes; GC Lồng machines use numeric codes.
-- Standard from the supplied Lồng table: 605 units/hour.
-- Idempotent: only missing active machine mappings are inserted.

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
  AND m.status = 'active'
  AND TRIM(m.machine_code) REGEXP '^[0-9]+$'
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
