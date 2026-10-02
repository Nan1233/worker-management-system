-- KTC / TiDB SAFE GC DEFECT BACKFILL 2026-10-02
-- Purpose: restore missing production_report_defects for legacy approved GC
-- reports when the legacy import kept production_reports aggregate NG fields.
--
-- IMPORTANT:
--   * DRY RUN by default: @APPLY = 0
--   * No detail is invented from tt_ng.
--   * Only existing legacy aggregate columns are converted to the real FE/DB
--     defect codes created by migration 048:
--       CUT_1..CUT_10, LONG_1..LONG_8, XOAY
--   * Existing production_report_defects rows are never duplicated.
--   * Only approved GC reports with source_temp_id < 0 are candidates.
--
-- Run in TiDB Cloud. Review every candidate/result before changing @APPLY to 1.

USE worker_management;
SET @APPLY := 0;

SET @gc_process_id := (
  SELECT id FROM processes
  WHERE UPPER(TRIM(process_code))='GC'
  LIMIT 1
);

DROP TEMPORARY TABLE IF EXISTS tmp_gc_legacy_defect_source;
CREATE TEMPORARY TABLE tmp_gc_legacy_defect_source (
  report_id BIGINT NOT NULL,
  process_id BIGINT NOT NULL,
  defect_code VARCHAR(100) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL,
  PRIMARY KEY (report_id, defect_code)
);

-- Collapse all legacy fields that represent the same FE defect type.
INSERT INTO tmp_gc_legacy_defect_source(report_id, process_id, defect_code, quantity)
SELECT id, process_id, 'CUT_1',
       COALESCE(kqd_dap_lai,0) + COALESCE(kqd_tuot,0) + COALESCE(khong_dut,0)
FROM production_reports
WHERE status='approved'
  AND process_id=@gc_process_id
  AND source_temp_id<0
  AND (
    COALESCE(kqd_dap_lai,0) + COALESCE(kqd_tuot,0) + COALESCE(khong_dut,0)
  ) > 0
UNION ALL
SELECT id, process_id, 'LONG_2', COALESCE(vo_do_long,0)
FROM production_reports
WHERE status='approved' AND process_id=@gc_process_id AND source_temp_id<0
  AND COALESCE(vo_do_long,0)>0
UNION ALL
SELECT id, process_id, 'LONG_3', COALESCE(xuoc_do_long,0)
FROM production_reports
WHERE status='approved' AND process_id=@gc_process_id AND source_temp_id<0
  AND COALESCE(xuoc_do_long,0)>0
UNION ALL
SELECT id, process_id, 'LONG_4', COALESCE(cong_gay,0)
FROM production_reports
WHERE status='approved' AND process_id=@gc_process_id AND source_temp_id<0
  AND COALESCE(cong_gay,0)>0
UNION ALL
SELECT id, process_id, 'XOAY', COALESCE(xoay,0)
FROM production_reports
WHERE status='approved' AND process_id=@gc_process_id AND source_temp_id<0
  AND COALESCE(xoay,0)>0
UNION ALL
SELECT id, process_id, 'CUT_6', COALESCE(bavia_hut,0)
FROM production_reports
WHERE status='approved' AND process_id=@gc_process_id AND source_temp_id<0
  AND COALESCE(bavia_hut,0)>0
UNION ALL
SELECT id, process_id, 'CUT_7', COALESCE(ppcm,0)
FROM production_reports
WHERE status='approved' AND process_id=@gc_process_id AND source_temp_id<0
  AND COALESCE(ppcm,0)>0
UNION ALL
SELECT id, process_id, 'CUT_8', COALESCE(loi_cao_su,0)
FROM production_reports
WHERE status='approved' AND process_id=@gc_process_id AND source_temp_id<0
  AND COALESCE(loi_cao_su,0)>0
UNION ALL
SELECT id, process_id, 'CUT_10', COALESCE(ng_kich_thuoc,0)
FROM production_reports
WHERE status='approved' AND process_id=@gc_process_id AND source_temp_id<0
  AND COALESCE(ng_kich_thuoc,0)>0
UNION ALL
SELECT id, process_id, 'CUT_2', COALESCE(cat_lem,0)
FROM production_reports
WHERE status='approved' AND process_id=@gc_process_id AND source_temp_id<0
  AND COALESCE(cat_lem,0)>0;

-- Resolve each real FE/DB defect code to defect_types.id.
DROP TEMPORARY TABLE IF EXISTS tmp_gc_legacy_defect_resolved;
CREATE TEMPORARY TABLE tmp_gc_legacy_defect_resolved AS
SELECT
  s.report_id,
  s.process_id,
  dt.id AS defect_type_id,
  s.defect_code,
  s.quantity
FROM tmp_gc_legacy_defect_source s
JOIN defect_types dt
  ON dt.process_id=s.process_id
 AND UPPER(TRIM(COALESCE(dt.defect_code,'')))=s.defect_code
 AND COALESCE(dt.status,'active')='active';

-- 1) Candidate summary.
SELECT
  'CANDIDATES' AS check_name,
  COUNT(*) AS candidate_detail_rows,
  COUNT(DISTINCT report_id) AS candidate_reports,
  COALESCE(SUM(quantity),0) AS candidate_quantity
FROM tmp_gc_legacy_defect_resolved;

-- 2) Verify no unresolved legacy code remains.
SELECT
  s.report_id,
  s.defect_code,
  s.quantity
FROM tmp_gc_legacy_defect_source s
LEFT JOIN tmp_gc_legacy_defect_resolved r
  ON r.report_id=s.report_id
 AND r.defect_code=s.defect_code
WHERE r.report_id IS NULL
ORDER BY s.report_id,s.defect_code
LIMIT 500;

-- 3) Show reports where total NG exists but no persisted detail yet.
SELECT
  pr.id AS report_id,
  pr.work_date,
  pr.tt_ng AS report_total_ng,
  COALESCE((SELECT SUM(d.quantity)
            FROM production_report_defects d
            WHERE d.report_id=pr.id),0) AS existing_detail_ng,
  COALESCE((SELECT SUM(x.quantity)
            FROM tmp_gc_legacy_defect_resolved x
            WHERE x.report_id=pr.id),0) AS legacy_detail_ng,
  pr.source_temp_id
FROM production_reports pr
WHERE pr.status='approved'
  AND pr.process_id=@gc_process_id
  AND pr.work_date>='2026-09-01'
  AND pr.work_date<'2026-10-01'
  AND pr.tt_ng>0
ORDER BY pr.id
LIMIT 500;

-- 4) The critical safety check: never create a detail row unless its source
-- comes from a real legacy aggregate field. No tt_ng-based distribution here.
SELECT
  'POST_APPLY_EXPECTED' AS check_name,
  COUNT(*) AS rows_that_would_be_inserted,
  COUNT(DISTINCT report_id) AS reports_that_would_be_changed,
  COALESCE(SUM(quantity),0) AS quantity_that_would_be_inserted
FROM tmp_gc_legacy_defect_resolved x
LEFT JOIN production_report_defects d
  ON d.report_id=x.report_id
 AND d.defect_type_id=x.defect_type_id
WHERE d.id IS NULL;

START TRANSACTION;

INSERT INTO production_report_defects(report_id, defect_type_id, quantity)
SELECT x.report_id, x.defect_type_id, x.quantity
FROM tmp_gc_legacy_defect_resolved x
LEFT JOIN production_report_defects d
  ON d.report_id=x.report_id
 AND d.defect_type_id=x.defect_type_id
WHERE @APPLY=1
  AND d.id IS NULL;

-- Verify the rows affected by this repair set.
SELECT
  'POST_CHECK' AS check_name,
  COUNT(*) AS detail_rows,
  COUNT(DISTINCT d.report_id) AS reports_with_detail,
  COALESCE(SUM(d.quantity),0) AS total_detail_quantity
FROM production_report_defects d
JOIN tmp_gc_legacy_defect_resolved x
  ON x.report_id=d.report_id
 AND x.defect_type_id=d.defect_type_id;

COMMIT;

-- After @APPLY=1, rerun the following read-only check and require the gap to
-- be zero for repaired reports whose entire NG source was legacy fields:
SELECT
  COUNT(*) AS gc_reports_with_ng,
  COALESCE(SUM(pr.tt_ng),0) AS total_ng,
  COALESCE(SUM(CASE WHEN COALESCE(dd.detail_ng,0)=pr.tt_ng THEN pr.tt_ng ELSE 0 END),0) AS fully_classified_ng,
  COALESCE(SUM(GREATEST(pr.tt_ng-COALESCE(dd.detail_ng,0),0)),0) AS remaining_unclassified_ng
FROM production_reports pr
LEFT JOIN (
  SELECT report_id, SUM(quantity) AS detail_ng
  FROM production_report_defects
  GROUP BY report_id
) dd ON dd.report_id=pr.id
WHERE pr.status='approved'
  AND pr.process_id=@gc_process_id
  AND pr.work_date>='2026-09-01'
  AND pr.work_date<'2026-10-01'
  AND pr.tt_ng>0;
