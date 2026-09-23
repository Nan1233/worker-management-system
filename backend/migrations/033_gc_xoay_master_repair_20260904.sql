-- KTC 033: canonical combined migration for the 2026-09-04/2026-09-09 GC/Lồng master repair.
--
-- 1) Canonicalize the GC XOAY defect master and deactivate duplicate historical rows.
-- 2) Map Lồng product 2801-LT to GC machine 11 at 605 units/hour.
-- Both changes are idempotent.

START TRANSACTION;

INSERT INTO defect_types (process_id, defect_code, defect_name, sort_order, status)
SELECT p.id,
       'XOAY',
       'Cao su xoay',
       COALESCE((SELECT MAX(d.sort_order) + 1
                   FROM defect_types d
                  WHERE d.process_id = p.id), 1),
       'active'
  FROM processes p
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND COALESCE(p.status, 'active') IN ('active', 'enabled', '1')
   AND NOT EXISTS (
       SELECT 1
         FROM defect_types d
        WHERE d.process_id = p.id
          AND (UPPER(TRIM(d.defect_code)) = 'XOAY'
               OR LOWER(TRIM(d.defect_name)) = LOWER('Cao su xoay'))
   );

UPDATE defect_types d
JOIN processes p ON p.id = d.process_id
   SET d.defect_code = 'XOAY',
       d.defect_name = 'Cao su xoay',
       d.status = 'active'
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND (UPPER(TRIM(d.defect_code)) = 'XOAY'
        OR LOWER(TRIM(d.defect_name)) = LOWER('Cao su xoay'));

UPDATE defect_types d
JOIN processes p ON p.id = d.process_id
JOIN (
    SELECT MIN(d2.id) AS keep_id
      FROM defect_types d2
      JOIN processes p2 ON p2.id = d2.process_id
     WHERE UPPER(TRIM(p2.process_code)) = 'GC'
       AND UPPER(TRIM(d2.defect_code)) = 'XOAY'
     GROUP BY d2.process_id
) k ON k.keep_id <> d.id
   SET d.status = 'inactive'
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND UPPER(TRIM(d.defect_code)) = 'XOAY';

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
