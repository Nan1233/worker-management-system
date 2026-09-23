-- KTC 032: canonical combined migration for the 2026-09-04/2026-09-08 GC/Lồng master updates.
--
-- 1) Add Lồng-only machine product 2801-LT at 605 units/hour.
-- 2) Add/activate the canonical GC XOAY defect (Cao su xoay).
-- Both changes are idempotent.

START TRANSACTION;

INSERT INTO product_standards
    (process_id, work_type, product_code, standard_output, exclude_kqd_from_tt, status)
VALUES
    (1, 'LONG', '2801-LT', 605, 0, 'active')
ON DUPLICATE KEY UPDATE
    work_type = VALUES(work_type),
    standard_output = VALUES(standard_output),
    exclude_kqd_from_tt = VALUES(exclude_kqd_from_tt),
    status = 'active';

INSERT INTO product_standard_versions
    (process_id, product_code, standard_output, exclude_kqd_from_tt, version_no, effective_from, effective_to, status)
SELECT
    1, '2801-LT', 605, 0, 1, '2026-09-08', NULL, 'active'
WHERE NOT EXISTS (
    SELECT 1
    FROM product_standard_versions
    WHERE process_id = 1
      AND product_code = '2801-LT'
      AND status = 'active'
);

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

UPDATE defect_types d
JOIN processes p ON p.id = d.process_id
SET d.defect_name = 'Cao su xoay',
    d.status = 'active'
WHERE UPPER(TRIM(p.process_code)) = 'GC'
  AND UPPER(TRIM(d.defect_code)) = 'XOAY';

COMMIT;
