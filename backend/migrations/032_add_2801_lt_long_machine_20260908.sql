-- KTC 032: canonical combined migration for the 2026-09-04/2026-09-08 GC/Lồng master updates.
-- 1) Add Lồng-only machine product 2801-LT at 605 units/hour.
-- 2) Add/activate the canonical GC XOAY defect (Cao su xoay).
-- Both changes are idempotent.

CREATE TABLE IF NOT EXISTS product_standard_versions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    process_id BIGINT NOT NULL,
    product_code VARCHAR(180) NOT NULL,
    standard_output DECIMAL(18,6) NOT NULL,
    exclude_kqd_from_tt TINYINT(1) NOT NULL DEFAULT 0,
    version_no INT NOT NULL DEFAULT 1,
    effective_from DATE NULL,
    effective_to DATE NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_product_standard_versions_process_product_version (process_id, product_code, version_no),
    KEY idx_product_standard_versions_lookup (process_id, product_code, status, effective_from)
);

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
