-- KTC TEST / ONE-OFF REPAIR 2026-09-30
-- Restore missing approved-report detail rows created by the large legacy SQL import.
-- The legacy import populated production_reports + extra_data but skipped
-- production_report_deductions / production_report_defects.
--
-- NOT an automatic migration. Run manually in TiDB.
-- Default: DRY-RUN only. Set @APPLY=1 after reviewing all checks.
-- Idempotent: existing detail rows are never duplicated.

USE worker_management;
SET @APPLY := 0;

/* ================================================================
   1) DEDUCTIONS: rebuild from extra_data.columns
   ================================================================ */
DROP TEMPORARY TABLE IF EXISTS tmp_ktc_legacy_deduction_backfill;
CREATE TEMPORARY TABLE tmp_ktc_legacy_deduction_backfill (
    report_id BIGINT NOT NULL,
    process_id BIGINT NOT NULL,
    deduction_code VARCHAR(100) NOT NULL,
    deduction_name VARCHAR(255) NOT NULL,
    hours DECIMAL(12,4) NOT NULL,
    PRIMARY KEY (report_id, deduction_code)
);

INSERT INTO tmp_ktc_legacy_deduction_backfill
(report_id, process_id, deduction_code, deduction_name, hours)
SELECT r.id, r.process_id, 'THIEU_SAN_LUONG', 'Thiếu sản lượng',
       CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Thiếu sản lượng"')), ''), '0') AS DECIMAL(12,4))
FROM production_reports r
WHERE r.status='approved' AND r.source_temp_id<0 AND r.extra_data IS NOT NULL
  AND CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Thiếu sản lượng"')), ''), '0') AS DECIMAL(12,4))>0
UNION ALL
SELECT r.id,r.process_id,'CHUYEN_MA','Chuyển mã',CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Chuyển mã"')), ''),'0') AS DECIMAL(12,4))
FROM production_reports r WHERE r.status='approved' AND r.source_temp_id<0 AND r.extra_data IS NOT NULL
  AND CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Chuyển mã"')), ''),'0') AS DECIMAL(12,4))>0
UNION ALL
SELECT r.id,r.process_id,'CHINH_MAY','Chỉnh máy',CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Chỉnh máy"')), ''),'0') AS DECIMAL(12,4))
FROM production_reports r WHERE r.status='approved' AND r.source_temp_id<0 AND r.extra_data IS NOT NULL
  AND CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Chỉnh máy"')), ''),'0') AS DECIMAL(12,4))>0
UNION ALL
SELECT r.id,r.process_id,'NGHI_GIAI_LAO','Nghỉ giải lao',CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Nghỉ giải lao"')), ''),'0') AS DECIMAL(12,4))
FROM production_reports r WHERE r.status='approved' AND r.source_temp_id<0 AND r.extra_data IS NOT NULL
  AND CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Nghỉ giải lao"')), ''),'0') AS DECIMAL(12,4))>0
UNION ALL
SELECT r.id,r.process_id,'GIAO_CA','Giao ca',CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Giao ca"')), ''),'0') AS DECIMAL(12,4))
FROM production_reports r WHERE r.status='approved' AND r.source_temp_id<0 AND r.extra_data IS NOT NULL
  AND CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Giao ca"')), ''),'0') AS DECIMAL(12,4))>0
UNION ALL
SELECT r.id,r.process_id,'DUNG_MAY_HO_TRO','Dừng máy đi hỗ trợ',CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Dừng máy đi hỗ trợ"')), ''),'0') AS DECIMAL(12,4))
FROM production_reports r WHERE r.status='approved' AND r.source_temp_id<0 AND r.extra_data IS NOT NULL
  AND CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Dừng máy đi hỗ trợ"')), ''),'0') AS DECIMAL(12,4))>0
UNION ALL
SELECT r.id,r.process_id,'GIAT_CS_CAN_CS_TUOT_TAI_PP_GL','Giặt cs/cân cs, tuốt-tái pp, GL',CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Giặt cs/cân cs, tuốt-tái pp, GL"')), ''),'0') AS DECIMAL(12,4))
FROM production_reports r WHERE r.status='approved' AND r.source_temp_id<0 AND r.extra_data IS NOT NULL
  AND CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Giặt cs/cân cs, tuốt-tái pp, GL"')), ''),'0') AS DECIMAL(12,4))>0
UNION ALL
SELECT r.id,r.process_id,'5S','5s',CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."5s"')), ''),'0') AS DECIMAL(12,4))
FROM production_reports r WHERE r.status='approved' AND r.source_temp_id<0 AND r.extra_data IS NOT NULL
  AND CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."5s"')), ''),'0') AS DECIMAL(12,4))>0
UNION ALL
SELECT r.id,r.process_id,'HOC_VIEC_DAO_TAO','Học việc, đào tạo',CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Học việc, đào tạo"')), ''),'0') AS DECIMAL(12,4))
FROM production_reports r WHERE r.status='approved' AND r.source_temp_id<0 AND r.extra_data IS NOT NULL
  AND CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Học việc, đào tạo"')), ''),'0') AS DECIMAL(12,4))>0
UNION ALL
SELECT r.id,r.process_id,'DI_MUON_VE_SOM','Đi muộn về sớm',CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Đi muộn về sớm"')), ''),'0') AS DECIMAL(12,4))
FROM production_reports r WHERE r.status='approved' AND r.source_temp_id<0 AND r.extra_data IS NOT NULL
  AND CAST(COALESCE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(r.extra_data, '$.columns."Đi muộn về sớm"')), ''),'0') AS DECIMAL(12,4))>0;

DROP TEMPORARY TABLE IF EXISTS tmp_ktc_legacy_deduction_resolved;
CREATE TEMPORARY TABLE tmp_ktc_legacy_deduction_resolved AS
SELECT b.report_id,dt.id deduction_type_id,b.deduction_code,b.deduction_name,b.hours
FROM tmp_ktc_legacy_deduction_backfill b
JOIN deduction_types dt ON dt.process_id=b.process_id
 AND UPPER(TRIM(COALESCE(dt.deduction_code,'')))=b.deduction_code
 AND LOWER(TRIM(COALESCE(dt.deduction_name,'')))=LOWER(TRIM(b.deduction_name))
 AND COALESCE(dt.status,'active')='active';

SELECT 'DEDUCTION_CANDIDATES' check_name,COUNT(*) rows_to_insert,COUNT(DISTINCT report_id) reports_affected,ROUND(SUM(hours),4) hours_to_restore
FROM tmp_ktc_legacy_deduction_resolved;

SELECT r.id report_id,r.source_temp_id,r.work_date,r.deduction_time report_deduction_time,
 ROUND(COALESCE((SELECT SUM(d.hours) FROM production_report_deductions d WHERE d.report_id=r.id),0),4) existing_detail_deduction,
 ROUND(COALESCE((SELECT SUM(x.hours) FROM tmp_ktc_legacy_deduction_resolved x WHERE x.report_id=r.id),0),4) source_detail_deduction
FROM production_reports r
WHERE r.status='approved' AND r.source_temp_id<0
 AND EXISTS(SELECT 1 FROM tmp_ktc_legacy_deduction_resolved x WHERE x.report_id=r.id)
ORDER BY r.id LIMIT 100;

/* ================================================================
   2) DEFECTS / NG: rebuild from legacy aggregate columns
   ================================================================ */
DROP TEMPORARY TABLE IF EXISTS tmp_ktc_legacy_defect_backfill;
CREATE TEMPORARY TABLE tmp_ktc_legacy_defect_backfill (
    report_id BIGINT NOT NULL,
    process_id BIGINT NOT NULL,
    defect_code VARCHAR(100) NOT NULL,
    quantity DECIMAL(18,4) NOT NULL,
    PRIMARY KEY(report_id,defect_code)
);

INSERT INTO tmp_ktc_legacy_defect_backfill(report_id,process_id,defect_code,quantity)
SELECT id,process_id,'KQD_DAP_LAI',COALESCE(kqd_dap_lai,0) FROM production_reports WHERE status='approved' AND source_temp_id<0 AND COALESCE(kqd_dap_lai,0)>0
UNION ALL SELECT id,process_id,'VO_DO_LONG',COALESCE(vo_do_long,0) FROM production_reports WHERE status='approved' AND source_temp_id<0 AND COALESCE(vo_do_long,0)>0
UNION ALL SELECT id,process_id,'XUOC_DO_LONG',COALESCE(xuoc_do_long,0) FROM production_reports WHERE status='approved' AND source_temp_id<0 AND COALESCE(xuoc_do_long,0)>0
UNION ALL SELECT id,process_id,'CONG_GAY',COALESCE(cong_gay,0) FROM production_reports WHERE status='approved' AND source_temp_id<0 AND COALESCE(cong_gay,0)>0
UNION ALL SELECT id,process_id,'XOAY',COALESCE(xoay,0) FROM production_reports WHERE status='approved' AND source_temp_id<0 AND COALESCE(xoay,0)>0
UNION ALL SELECT id,process_id,'KHONG_DUT',COALESCE(khong_dut,0) FROM production_reports WHERE status='approved' AND source_temp_id<0 AND COALESCE(khong_dut,0)>0
UNION ALL SELECT id,process_id,'BAVIA_HUT',COALESCE(bavia_hut,0) FROM production_reports WHERE status='approved' AND source_temp_id<0 AND COALESCE(bavia_hut,0)>0
UNION ALL SELECT id,process_id,'PPCM',COALESCE(ppcm,0) FROM production_reports WHERE status='approved' AND source_temp_id<0 AND COALESCE(ppcm,0)>0
UNION ALL SELECT id,process_id,'LOI_CAO_SU',COALESCE(loi_cao_su,0) FROM production_reports WHERE status='approved' AND source_temp_id<0 AND COALESCE(loi_cao_su,0)>0
UNION ALL SELECT id,process_id,'NG_KICH_THUOC',COALESCE(ng_kich_thuoc,0) FROM production_reports WHERE status='approved' AND source_temp_id<0 AND COALESCE(ng_kich_thuoc,0)>0
UNION ALL SELECT id,process_id,'CAT_LEM',COALESCE(cat_lem,0) FROM production_reports WHERE status='approved' AND source_temp_id<0 AND COALESCE(cat_lem,0)>0;

DROP TEMPORARY TABLE IF EXISTS tmp_ktc_legacy_defect_resolved;
CREATE TEMPORARY TABLE tmp_ktc_legacy_defect_resolved AS
SELECT b.report_id,dt.id defect_type_id,b.defect_code,b.quantity
FROM tmp_ktc_legacy_defect_backfill b
JOIN defect_types dt ON dt.process_id=b.process_id
 AND UPPER(TRIM(COALESCE(dt.defect_code,'')))=b.defect_code
 AND COALESCE(dt.status,'active')='active';

SELECT 'DEFECT_CANDIDATES' check_name,COUNT(*) rows_to_insert,COUNT(DISTINCT report_id) reports_affected,SUM(quantity) quantity_to_restore
FROM tmp_ktc_legacy_defect_resolved;

SELECT b.report_id,b.defect_code,b.quantity,dt.defect_name
FROM tmp_ktc_legacy_defect_resolved b JOIN defect_types dt ON dt.id=b.defect_type_id
ORDER BY b.report_id,b.defect_code LIMIT 200;

/* ================================================================
   3) UNRESOLVED MAPPINGS: these must be reviewed before APPLY=1
   ================================================================ */
SELECT 'UNRESOLVED_DEDUCTION_TYPES' check_name,b.*
FROM tmp_ktc_legacy_deduction_backfill b
LEFT JOIN tmp_ktc_legacy_deduction_resolved r ON r.report_id=b.report_id AND r.deduction_code=b.deduction_code
WHERE r.report_id IS NULL ORDER BY b.report_id,b.deduction_code LIMIT 200;

SELECT 'UNRESOLVED_DEFECT_TYPES' check_name,b.*
FROM tmp_ktc_legacy_defect_backfill b
LEFT JOIN tmp_ktc_legacy_defect_resolved r ON r.report_id=b.report_id AND r.defect_code=b.defect_code
WHERE r.report_id IS NULL ORDER BY b.report_id,b.defect_code LIMIT 200;

/* ================================================================
   4) APPLY: idempotent INSERTs
   ================================================================ */
START TRANSACTION;

INSERT INTO production_report_deductions(report_id,deduction_type_id,hours)
SELECT x.report_id,x.deduction_type_id,x.hours
FROM tmp_ktc_legacy_deduction_resolved x
LEFT JOIN production_report_deductions d ON d.report_id=x.report_id AND d.deduction_type_id=x.deduction_type_id
WHERE @APPLY=1 AND d.id IS NULL;

INSERT INTO production_report_defects(report_id,defect_type_id,quantity)
SELECT x.report_id,x.defect_type_id,x.quantity
FROM tmp_ktc_legacy_defect_resolved x
LEFT JOIN production_report_defects d ON d.report_id=x.report_id AND d.defect_type_id=x.defect_type_id
WHERE @APPLY=1 AND d.id IS NULL;

SELECT 'POST_CHECK_DEDUCTIONS' check_name,COUNT(*) detail_rows,COUNT(DISTINCT report_id) reports_with_details,ROUND(SUM(hours),4) total_hours
FROM production_report_deductions WHERE report_id IN(SELECT report_id FROM tmp_ktc_legacy_deduction_resolved);

SELECT 'POST_CHECK_DEFECTS' check_name,COUNT(*) detail_rows,COUNT(DISTINCT report_id) reports_with_details,SUM(quantity) total_quantity
FROM production_report_defects WHERE report_id IN(SELECT report_id FROM tmp_ktc_legacy_defect_resolved);

-- COMMIT is safe with @APPLY=0 because the INSERTs affect zero rows.
-- Set @APPLY=1 to persist the idempotent backfill.
COMMIT;
