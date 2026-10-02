-- READ-ONLY KTC GC export audit for TiDB Cloud.
-- No INSERT/UPDATE/DELETE/DDL.
-- Purpose: prove where September 2026 NG detail actually exists before any repair.

USE worker_management;

SET @gc_process_id := (
  SELECT id FROM processes
  WHERE UPPER(TRIM(process_code))='GC'
  LIMIT 1
);

-- 1) Master identity: the real FE/DB GC defect codes.
SELECT id AS defect_type_id, process_id, defect_code, defect_name, sort_order, status
FROM defect_types
WHERE process_id=@gc_process_id
ORDER BY sort_order, id;

-- 2) September approved GC aggregate vs relational detail sources.
SELECT
  pr.id AS report_id,
  pr.work_date,
  pr.source_temp_id,
  pr.operation_mode,
  pr.tt_ng,
  COALESCE(pd.detail_ng,0) AS report_defect_ng,
  COALESCE(md.machine_defect_ng,0) AS machine_defect_ng,
  COALESCE(ml.machine_line_count,0) AS machine_line_count,
  COALESCE(ml.json_line_count,0) AS machine_lines_with_json,
  COALESCE(ml.json_defect_quantity,0) AS machine_json_ng,
  COALESCE(ls.legacy_ng,0) AS legacy_field_ng
FROM production_reports pr
LEFT JOIN (
  SELECT report_id, SUM(quantity) AS detail_ng
  FROM production_report_defects
  GROUP BY report_id
) pd ON pd.report_id=pr.id
LEFT JOIN (
  SELECT ml.report_id, SUM(d.quantity) AS machine_defect_ng
  FROM production_report_machine_lines ml
  JOIN production_report_machine_defects d ON d.machine_line_id=ml.id
  GROUP BY ml.report_id
) md ON md.report_id=pr.id
LEFT JOIN (
  SELECT report_id,
         COUNT(*) AS machine_line_count,
         SUM(CASE WHEN defects_json IS NOT NULL AND TRIM(CAST(defects_json AS CHAR)) NOT IN ('','[]','{}','null') THEN 1 ELSE 0 END) AS json_line_count,
         0 AS json_defect_quantity
  FROM production_report_machine_lines
  GROUP BY report_id
) ml ON ml.report_id=pr.id
LEFT JOIN (
  SELECT id AS report_id,
         COALESCE(kqd_dap_lai,0)+COALESCE(kqd_tuot,0)+COALESCE(vo_do_long,0)+COALESCE(xuoc_do_long,0)+COALESCE(cong_gay,0)+COALESCE(xoay,0)+COALESCE(khong_dut,0)+COALESCE(bavia_hut,0)+COALESCE(ppcm,0)+COALESCE(loi_cao_su,0)+COALESCE(ng_kich_thuoc,0)+COALESCE(cat_lem,0) AS legacy_ng
  FROM production_reports
) ls ON ls.report_id=pr.id
WHERE pr.status='approved'
  AND pr.process_id=@gc_process_id
  AND pr.work_date>='2026-09-01'
  AND pr.work_date<'2026-10-01'
  AND COALESCE(pr.tt_ng,0)>0
ORDER BY pr.id;

-- 3) Aggregate summary. This is the key proof point.
SELECT
  COUNT(*) AS gc_reports_with_ng,
  COALESCE(SUM(pr.tt_ng),0) AS total_ng,
  COALESCE(SUM(CASE WHEN COALESCE(pd.detail_ng,0)=pr.tt_ng THEN pr.tt_ng ELSE 0 END),0) AS fully_classified_by_report_defects,
  COALESCE(SUM(CASE WHEN COALESCE(md.machine_defect_ng,0)=pr.tt_ng THEN pr.tt_ng ELSE 0 END),0) AS fully_classified_by_machine_defects,
  COALESCE(SUM(CASE WHEN COALESCE(pd.detail_ng,0)+COALESCE(md.machine_defect_ng,0)>0 THEN 1 ELSE 0 END),0) AS reports_with_any_relational_detail,
  COALESCE(SUM(GREATEST(pr.tt_ng-COALESCE(pd.detail_ng,0)-COALESCE(md.machine_defect_ng,0),0)),0) AS remaining_unclassified_ng,
  COALESCE(SUM(CASE WHEN COALESCE(ls.legacy_ng,0)>0 THEN 1 ELSE 0 END),0) AS reports_with_legacy_fields
FROM production_reports pr
LEFT JOIN (
  SELECT report_id, SUM(quantity) AS detail_ng
  FROM production_report_defects
  GROUP BY report_id
) pd ON pd.report_id=pr.id
LEFT JOIN (
  SELECT ml.report_id, SUM(d.quantity) AS machine_defect_ng
  FROM production_report_machine_lines ml
  JOIN production_report_machine_defects d ON d.machine_line_id=ml.id
  GROUP BY ml.report_id
) md ON md.report_id=pr.id
LEFT JOIN (
  SELECT id AS report_id,
         COALESCE(kqd_dap_lai,0)+COALESCE(kqd_tuot,0)+COALESCE(vo_do_long,0)+COALESCE(xuoc_do_long,0)+COALESCE(cong_gay,0)+COALESCE(xoay,0)+COALESCE(khong_dut,0)+COALESCE(bavia_hut,0)+COALESCE(ppcm,0)+COALESCE(loi_cao_su,0)+COALESCE(ng_kich_thuoc,0)+COALESCE(cat_lem,0) AS legacy_ng
  FROM production_reports
) ls ON ls.report_id=pr.id
WHERE pr.status='approved'
  AND pr.process_id=@gc_process_id
  AND pr.work_date>='2026-09-01'
  AND pr.work_date<'2026-10-01'
  AND COALESCE(pr.tt_ng,0)>0;

-- 4) For reports that have machine-line rows, show the actual relational machine defects.
SELECT
  ml.report_id,
  ml.id AS machine_line_id,
  ml.machine_code,
  ml.product_code,
  ml.ng_quantity,
  d.defect_type_id,
  d.defect_code,
  d.defect_name,
  d.quantity
FROM production_report_machine_lines ml
JOIN production_report_machine_defects d ON d.machine_line_id=ml.id
WHERE ml.report_id IN (
  SELECT id FROM production_reports
  WHERE status='approved' AND process_id=@gc_process_id
    AND work_date>='2026-09-01' AND work_date<'2026-10-01'
)
ORDER BY ml.report_id, ml.sort_order, d.id;

-- 5) Sample raw report rows for reports where aggregate NG exists but both
-- normalized relational detail sources are empty. This helps decide whether
-- the remaining source is legacy fields, extra_data, snapshot_data, or a data-loss event.
SELECT
  pr.id,
  pr.source_temp_id,
  pr.work_date,
  pr.operation_mode,
  pr.tt_ng,
  pr.kqd_dap_lai, pr.kqd_tuot, pr.vo_do_long, pr.xuoc_do_long, pr.cong_gay,
  pr.xoay, pr.khong_dut, pr.bavia_hut, pr.ppcm, pr.loi_cao_su,
  pr.ng_kich_thuoc, pr.cat_lem,
  pr.extra_data
FROM production_reports pr
LEFT JOIN (
  SELECT report_id, SUM(quantity) AS detail_ng
  FROM production_report_defects
  GROUP BY report_id
) pd ON pd.report_id=pr.id
LEFT JOIN (
  SELECT ml.report_id, SUM(d.quantity) AS machine_defect_ng
  FROM production_report_machine_lines ml
  JOIN production_report_machine_defects d ON d.machine_line_id=ml.id
  GROUP BY ml.report_id
) md ON md.report_id=pr.id
WHERE pr.status='approved'
  AND pr.process_id=@gc_process_id
  AND pr.work_date>='2026-09-01'
  AND pr.work_date<'2026-10-01'
  AND pr.tt_ng>0
  AND COALESCE(pd.detail_ng,0)=0
  AND COALESCE(md.machine_defect_ng,0)=0
ORDER BY pr.id
LIMIT 100;
