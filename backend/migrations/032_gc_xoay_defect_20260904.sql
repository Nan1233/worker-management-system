-- KTC: Cắt/Lồng must expose the XOAY NG defect (Cao su xoay).
-- Keep this idempotent so re-running deployment/bootstrap is safe.
INSERT INTO defect_types (process_id, defect_code, defect_name, sort_order, status)
SELECT p.id, 'XOAY', 'Cao su xoay',
       COALESCE((SELECT MAX(d.sort_order) + 1 FROM defect_types d WHERE d.process_id = p.id), 1),
       'active'
FROM processes p
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND COALESCE(p.status, 'active') IN ('active', 'enabled', '1')
  AND NOT EXISTS (
    SELECT 1
    FROM defect_types d
    WHERE d.process_id = p.id
      AND UPPER(TRIM(d.defect_code)) = 'XOAY'
  );

-- If XOAY already exists but was inactive, make the master option active.
UPDATE defect_types d
JOIN processes p ON p.id = d.process_id
SET d.defect_name = 'Cao su xoay',
    d.status = 'active'
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND UPPER(TRIM(d.defect_code)) = 'XOAY';
