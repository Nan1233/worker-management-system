-- KTC: canonical GC NG master repair.
-- Both the normal GC NG panel and every machine-line NG panel use defect_types
-- for the selected process. Keep exactly one active canonical XOAY row.

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

-- Deactivate duplicate historical rows; the first canonical row remains active.
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
