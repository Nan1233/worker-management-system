-- KTC TEST / ONE-OFF REPAIR 2026-09-30
-- Purpose:
--   Restore missing approved-report detail rows for the large legacy SQL import.
--   The legacy import populated production_reports + extra_data, but did not
--   populate production_report_deductions / production_report_defects.
--
-- IMPORTANT:
--   This file is NOT an automatic migration. Run manually in TiDB.
--   Default is DRY-RUN only (@APPLY = 0).
--   Set @APPLY = 1 only after reviewing the DRY-RUN result.
--
-- Sources verified against current test-branch code:
--   - approved report detail deductions are read from production_report_deductions.
--   - approved report detail defects are read from production_report_defects.
--   - production_reports.extra_data preserves the original imported 212-column row.
--
-- The repair is idempotent: existing detail rows are never duplicated.

USE worker_management;

SET @APPLY := 0;

DROP TEMPORARY TABLE IF EXISTS tmp_ktc_legacy_deduction_backfill;
CREATE TEMPORARY TABLE tmp_ktc_legacy_deduction_backfill (
    report_id BIGINT NOT NULL,
    process_id BIGINT NOT NULL,
    deduction_code VARCHAR(100) NOT NULL,
    deduction_name VARCHAR(255) NOT NULL,
    hours DECIMAL(12,4) NOT NULL,
    PRIMARY KEY (report_id, deduction_code)
);

-- Read the original deduction components preserved in extra_data.columns.
INSERT INTO tmp_ktc_legacy_deduction_backfill
    (report_id, process_id, deduction_code, deduction_name, hours)
SELECT r.id, r.process_id, x.deduction_code, x.deduction_name,
       CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, x.json_path)), ''), '0') AS DECIMAL(12,4)) AS hours
FROM production_reports r
JOIN (
    SELECT 'THIEU_SAN_LUONG' deduction_code, 'Thiếu sản lượng' deduction_name, '$.columns."Thiếu sản lượng"' json_path
    UNION ALL SELECT 'CHUYEN_MA', 'Chuyển mã', '$.columns."Chuyển mã"'
    UNION ALL SELECT 'CHINH_MAY', 'Chỉnh máy', '$.columns."Chỉnh máy"'
    UNION ALL SELECT 'NGHI_GIAI_LAO', 'Nghỉ giải lao', '$.columns."Nghỉ giải lao"'
    UNION ALL SELECT 'GIAO_CA', 'Giao ca', '$.columns."Giao ca"'
    UNION ALL SELECT 'DUNG_MAY_HO_TRO', 'Dừng máy đi hỗ trợ', '$.columns."Dừng máy đi hỗ trợ"'
    UNION ALL SELECT 'GIAT_CS_CAN_CS_TUOT_TAI_PP_GL', 'Giặt cs/cân cs, tuốt-tái pp, GL', '$.columns."Giặt cs/cân cs, tuốt-tái pp, GL"'
    UNION ALL SELECT '5S', '5s', '$.columns."5s"'
    UNION ALL SELECT 'HOC_VIEC_DAO_TAO', 'Học việc, đào tạo', '$.columns."Học việc, đào tạo"'
    UNION ALL SELECT 'DI_MUON_VE_SOM', 'Đi muộn về sớm', '$.columns."Đi muộn về sớm"'
) x
WHERE r.status = 'approved'
  AND r.source_temp_id < 0
  AND r.extra_data IS NOT NULL
  AND CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, x.json_path)), ''), '0') AS DECIMAL(12,4)) > 0;

-- Only keep deduction types that actually exist for the report's process.
DROP TEMPORARY TABLE IF EXISTS tmp_ktc_legacy_deduction_resolved;
CREATE TEMPORARY TABLE tmp_ktc_legacy_deduction_resolved AS
SELECT b.report_id, dt.id AS deduction_type_id, b.deduction_code, b.deduction_name, b.hours
FROM tmp_ktc_legacy_deduction_backfill b
JOIN deduction_types dt
  ON dt.process_id = b.process_id
 AND UPPER(TRIM(COALESCE(dt.deduction_code, ''))) = b.deduction_code
 AND LOWER(TRIM(COALESCE(dt.deduction_name, ''))) = LOWER(TRIM(b.deduction_name))
 AND COALESCE(dt.status, 'active') = 'active';

-- DRY-RUN: deduction candidates and totals.
SELECT
    'DEDUCTION_CANDIDATES' AS check_name,
    COUNT(*) AS rows_to_insert,
    COUNT(DISTINCT report_id) AS reports_affected,
    ROUND(SUM(hours), 4) AS hours_to_restore
FROM tmp_ktc_legacy_deduction_resolved;

SELECT
    r.id AS report_id,
    r.source_temp_id,
    r.worker_id,
    r.process_id,
    r.work_date,
    r.deduction_time AS report_deduction_time,
    ROUND(COALESCE((SELECT SUM(d.hours) FROM production_report_deductions d WHERE d.report_id = r.id), 0), 4) AS existing_detail_deduction,
    ROUND(COALESCE((SELECT SUM(x.hours) FROM tmp_ktc_legacy_deduction_resolved x WHERE x.report_id = r.id), 0), 4) AS source_detail_deduction,
    ROUND(COALESCE(r.deduction_time,0) - COALESCE((SELECT SUM(x.hours) FROM tmp_ktc_legacy_deduction_resolved x WHERE x.report_id = r.id),0), 4) AS unaccounted_deduction_after_source
FROM production_reports r
WHERE r.status = 'approved'
  AND r.source_temp_id < 0
  AND EXISTS (SELECT 1 FROM tmp_ktc_legacy_deduction_resolved x WHERE x.report_id = r.id)
ORDER BY r.id
LIMIT 100;

-- Build legacy NG/defect candidates from the authoritative legacy aggregate columns.
DROP TEMPORARY TABLE IF EXISTS tmp_ktc_legacy_defect_backfill;
CREATE TEMPORARY TABLE tmp_ktc_legacy_defect_backfill (
    report_id BIGINT NOT NULL,
    process_id BIGINT NOT NULL,
    defect_code VARCHAR(100) NOT NULL,
    quantity DECIMAL(18,4) NOT NULL,
    PRIMARY KEY (report_id, defect_code)
);

INSERT INTO tmp_ktc_legacy_defect_backfill (report_id, process_id, defect_code, quantity)
SELECT r.id, r.process_id, x.defect_code, CAST(x.quantity AS DECIMAL(18,4))
FROM production_reports r
JOIN (
    SELECT 'KQD_DAP_LAI' defect_code, 'kqd_dap_lai' source_col, 1 sort_no
    UNION ALL SELECT 'VO_DO_LONG', 'vo_do_long', 2
    UNION ALL SELECT 'XUOC_DO_LONG', 'xuoc_do_long', 3
    UNION ALL SELECT 'CONG_GAY', 'cong_gay', 4
    UNION ALL SELECT 'XOAY', 'xoay', 5
    UNION ALL SELECT 'KHONG_DUT', 'khong_dut', 6
    UNION ALL SELECT 'BAVIA_HUT', 'bavia_hut', 7
    UNION ALL SELECT 'PPCM', 'ppcm', 8
    UNION ALL SELECT 'LOI_CAO_SU', 'loi_cao_su', 9
    UNION ALL SELECT 'NG_KICH_THUOC', 'ng_kich_thuoc', 10
    UNION ALL SELECT 'CAT_LEM', 'cat_lem', 11
) x
JOIN LATERAL (
    SELECT CASE x.source_col
        WHEN 'kqd_dap_lai' THEN r.kqd_dap_lai
        WHEN 'vo_do_long' THEN r.vo_do_long
        WHEN 'xuoc_do_long' THEN r.xuoc_do_long
        WHEN 'cong_gay' THEN r.cong_gay
        WHEN 'xoay' THEN r.xoay
        WHEN 'khong_dut' THEN r.khong_dut
        WHEN 'bavia_hut' THEN r.bavia_hut
        WHEN 'ppcm' THEN r.ppcm
        WHEN 'loi_cao_su' THEN r.loi_cao_su
        WHEN 'ng_kich_thuoc' THEN r.ng_kich_thuoc
        WHEN 'cat_lem' THEN r.cat_lem
        ELSE 0
    END AS quantity
) q ON 1=1
WHERE r.status = 'approved'
  AND r.source_temp_id < 0
  AND COALESCE(q.quantity, 0) > 0;

DROP TEMPORARY TABLE IF EXISTS tmp_ktc_legacy_defect_resolved;
CREATE TEMPORARY TABLE tmp_ktc_legacy_defect_resolved AS
SELECT b.report_id, dt.id AS defect_type_id, b.defect_code, b.quantity
FROM tmp_ktc_legacy_defect_backfill b
JOIN defect_types dt
  ON dt.process_id = b.process_id
 AND UPPER(TRIM(COALESCE(dt.defect_code, ''))) = b.defect_code
 AND COALESCE(dt.status, 'active') = 'active';

-- DRY-RUN: defect candidates and totals.
SELECT
    'DEFECT_CANDIDATES' AS check_name,
    COUNT(*) AS rows_to_insert,
    COUNT(DISTINCT report_id) AS reports_affected,
    SUM(quantity) AS quantity_to_restore
FROM tmp_ktc_legacy_defect_resolved;

SELECT
    b.report_id,
    b.defect_code,
    b.quantity,
    dt.defect_name
FROM tmp_ktc_legacy_defect_resolved b
JOIN defect_types dt ON dt.id = b.defect_type_id
ORDER BY b.report_id, b.defect_code
LIMIT 200;

-- Any unresolved deduction/defect mappings MUST be reviewed before APPLY.
SELECT 'UNRESOLVED_DEDUCTION_TYPES' AS check_name, b.*
FROM tmp_ktc_legacy_deduction_backfill b
LEFT JOIN tmp_ktc_legacy_deduction_resolved r
  ON r.report_id=b.report_id AND r.deduction_code=b.deduction_code
WHERE r.report_id IS NULL
ORDER BY b.report_id, b.deduction_code
LIMIT 200;

SELECT 'UNRESOLVED_DEFECT_TYPES' AS check_name, b.*
FROM tmp_ktc_legacy_defect_backfill b
LEFT JOIN tmp_ktc_legacy_defect_resolved r
  ON r.report_id=b.report_id AND r.defect_code=b.defect_code
WHERE r.report_id IS NULL
ORDER BY b.report_id, b.defect_code
LIMIT 200;

-- APPLY section. Default @APPLY=0 means no permanent DB change.
START TRANSACTION;

INSERT INTO production_report_deductions (report_id, deduction_type_id, hours)
SELECT x.report_id, x.deduction_type_id, x.hours
FROM tmp_ktc_legacy_deduction_resolved x
LEFT JOIN production_report_deductions d
  ON d.report_id=x.report_id
 AND d.deduction_type_id=x.deduction_type_id
WHERE @APPLY = 1
  AND d.id IS NULL;

INSERT INTO production_report_defects (report_id, defect_type_id, quantity)
SELECT x.report_id, x.defect_type_id, x.quantity
FROM tmp_ktc_legacy_defect_resolved x
LEFT JOIN production_report_defects d
  ON d.report_id=x.report_id
 AND d.defect_type_id=x.defect_type_id
WHERE @APPLY = 1
  AND d.id IS NULL;

-- Verification after the INSERT statements.
SELECT
    'POST_CHECK_DEDUCTIONS' AS check_name,
    COUNT(*) AS detail_rows,
    COUNT(DISTINCT report_id) AS reports_with_details,
    ROUND(SUM(hours),4) AS total_hours
FROM production_report_deductions
WHERE report_id IN (SELECT report_id FROM tmp_ktc_legacy_deduction_resolved);

SELECT
    'POST_CHECK_DEFECTS' AS check_name,
    COUNT(*) AS detail_rows,
    COUNT(DISTINCT report_id) AS reports_with_details,
    SUM(quantity) AS total_quantity
FROM production_report_defects
WHERE report_id IN (SELECT report_id FROM tmp_ktc_legacy_defect_resolved);

-- When @APPLY=0 this transaction contains no permanent changes, but ROLLBACK
-- is still used intentionally as a safety guard. When @APPLY=1, COMMIT.
ROLLBACK;

-- IMPORTANT FOR APPLY:
-- Change the final ROLLBACK above to COMMIT only after reviewing all DRY-RUN
-- output and verifying unresolved mapping counts are zero (or intentionally
-- understood). Never run this file with @APPLY=1 blindly.
