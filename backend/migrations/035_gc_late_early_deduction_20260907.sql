-- KTC: ensure GC has the template deduction "Đi muộn về sớm".
-- Keep every existing GC deduction, including extra legacy/template entries.
-- If the row already exists, only normalize its active status and keep its ID.

INSERT INTO deduction_types (process_id, deduction_code, deduction_name, sort_order, status)
SELECT p.id,
       'DED_GC_LATE_EARLY',
       'Đi muộn về sớm',
       COALESCE((SELECT MAX(d.sort_order) + 1
                   FROM deduction_types d
                  WHERE d.process_id = p.id), 1),
       'active'
  FROM processes p
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND COALESCE(p.status, 'active') IN ('active', 'enabled', '1')
   AND NOT EXISTS (
       SELECT 1
         FROM deduction_types d
        WHERE d.process_id = p.id
          AND (LOWER(TRIM(d.deduction_name)) = LOWER('Đi muộn về sớm')
               OR UPPER(TRIM(d.deduction_code)) = 'DED_GC_LATE_EARLY')
   );

UPDATE deduction_types d
JOIN processes p ON p.id = d.process_id
   SET d.deduction_name = 'Đi muộn về sớm',
       d.status = 'active'
 WHERE UPPER(TRIM(p.process_code)) = 'GC'
   AND (LOWER(TRIM(d.deduction_name)) = LOWER('Đi muộn về sớm')
        OR UPPER(TRIM(d.deduction_code)) = 'DED_GC_LATE_EARLY');
