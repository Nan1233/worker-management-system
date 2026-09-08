-- KTC: Add Lồng-only machine product 2801-LT.
-- Business rule: 2801-LT is selectable only for Lồng / Máy.
-- Standard from the supplied Lồng table: 605 units/hour.

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

COMMIT;
