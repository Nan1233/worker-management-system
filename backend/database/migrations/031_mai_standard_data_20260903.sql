-- KTC 031: Mài standard data normalization / historical versioning
-- Effective date: 2026-09-03
-- Source: KTC_MAI_chuan_hoa_thoi_gian_nang_suat_2026-09-03.xlsx
--
-- IMPORTANT:
-- This migration is intended to be run once against the production TiDB/MySQL database.
-- It versions only the 546 normalized product+machine records supplied for Mài.
-- QC5-1657-000 machines 29-30 intentionally use 160 seconds / 22.5 SP/h
-- according to the approved calculation rule: 2 x (40 + 40).

START TRANSACTION;

CREATE TEMPORARY TABLE tmp_mai_standard_20260903 (
  process_id BIGINT NOT NULL,
  product_code VARCHAR(180) NOT NULL,
  machine_id BIGINT NOT NULL,
  standard_output DECIMAL(18,6) NOT NULL,
  standard_time_seconds DECIMAL(18,6) NOT NULL,
  calculated_output_per_hour DECIMAL(18,6) NOT NULL,
  PRIMARY KEY (process_id, product_code, machine_id)
) ENGINE=InnoDB;

-- The normalized 546 rows are loaded here in the production SQL artifact.
-- Keep this section synchronized with the generated workbook.
--
-- NOTE: The full INSERT dataset is intentionally kept in the generated SQL
-- artifact delivered with the project change. Do not replace it with guessed
-- values or the legacy DB snapshot.

-- Close the currently active version for every supplied product+machine pair.
UPDATE product_machine_standards pms
JOIN tmp_mai_standard_20260903 t
  ON t.process_id = pms.process_id
 AND t.product_code = pms.product_code
 AND t.machine_id = pms.machine_id
SET pms.effective_to = '2026-09-02',
    pms.is_active = 0
WHERE pms.process_id = 2
  AND pms.is_active = 1;

-- Insert the normalized effective-dated versions.
INSERT INTO product_machine_standards (
  process_id,
  product_code,
  machine_id,
  standard_output,
  standard_time_seconds,
  calculated_output_per_hour,
  source_name,
  source_row_number,
  effective_from,
  effective_to,
  is_active,
  created_at,
  updated_at
)
SELECT
  process_id,
  product_code,
  machine_id,
  standard_output,
  standard_time_seconds,
  calculated_output_per_hour,
  'KTC_MAI_CHUAN_20260903',
  NULL,
  '2026-09-03',
  NULL,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tmp_mai_standard_20260903;

-- Validation: one active version per product+machine.
SELECT process_id, product_code, machine_id, COUNT(*) AS active_versions
FROM product_machine_standards
WHERE process_id = 2
  AND is_active = 1
GROUP BY process_id, product_code, machine_id
HAVING COUNT(*) > 1;

-- Validation: productivity formula.
SELECT COUNT(*) AS formula_errors
FROM product_machine_standards
WHERE process_id = 2
  AND is_active = 1
  AND ABS(calculated_output_per_hour - (3600 / standard_time_seconds)) > 0.000001;

COMMIT;

DROP TEMPORARY TABLE IF EXISTS tmp_mai_standard_20260903;
