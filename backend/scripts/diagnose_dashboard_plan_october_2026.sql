-- READ-ONLY diagnostics for Dashboard KH vs TT discrepancy.
-- Target period shown in the test screenshot: 2026-10-01 through 2026-10-30.
-- Run in TiDB Cloud SQL Editor against the SAME database used by the test backend.
-- These queries do not modify data.

-- 1) Compare source TT and the current dashboard KH formula by process.
SELECT
  r.process_id,
  p.process_code,
  p.process_name,
  COUNT(*) AS report_count,
  SUM(COALESCE(r.tt_ok,0)) AS tt_ok,
  SUM(COALESCE(r.tt_ng,0)) AS tt_ng,
  SUM(COALESCE(r.actual_output,0)) AS actual_output,
  SUM(CASE
    WHEN (
      UPPER(COALESCE(r.operation_mode,''))='MACHINE'
      OR (COALESCE(r.actual_time,0)<=0 AND COALESCE(ml.plan_line_count,0)>0)
    ) THEN COALESCE(ml.planned_quantity,0)
    WHEN COALESCE(r.standard_output,0)>0 AND COALESCE(r.actual_time,0)>0
    THEN r.standard_output*r.actual_time*
      LEAST(100,GREATEST(0,COALESCE(r.training_percent_snapshot,100)))/100
    ELSE 0
  END) AS dashboard_planned_quantity,
  SUM(CASE WHEN COALESCE(r.actual_time,0)<=0 THEN 1 ELSE 0 END) AS reports_without_worker_time,
  SUM(CASE WHEN COALESCE(ml.plan_line_count,0)>0 THEN 1 ELSE 0 END) AS reports_with_valid_machine_plan
FROM production_reports r
LEFT JOIN processes p ON p.id=r.process_id
LEFT JOIN (
  SELECT report_id,
    SUM(CASE
      WHEN COALESCE(machine_time_hours,0)>0
      THEN COALESCE(
        NULLIF(GREATEST(0,COALESCE(maximum_output,0)),0),
        NULLIF(GREATEST(0,COALESCE(standard_output,0)),0)*machine_time_hours,
        0
      )
      ELSE 0
    END) AS planned_quantity,
    COUNT(CASE
      WHEN COALESCE(machine_time_hours,0)>0
       AND COALESCE(
         NULLIF(GREATEST(0,COALESCE(maximum_output,0)),0),
         NULLIF(GREATEST(0,COALESCE(standard_output,0)),0)*machine_time_hours,
         0
       )>0
      THEN 1
    END) AS plan_line_count
  FROM production_report_machine_lines
  GROUP BY report_id
) ml ON ml.report_id=r.id
WHERE r.work_date BETWEEN '2026-10-01' AND '2026-10-30'
GROUP BY r.process_id,p.process_code,p.process_name
ORDER BY p.process_name;

-- 2) Find machine lines that may be undercounted because plan fields are missing/invalid.
SELECT
  r.id AS report_id,
  r.work_date,
  r.process_id,
  r.operation_mode,
  r.actual_time,
  ml.id AS machine_line_id,
  ml.machine_code,
  ml.product_code,
  ml.machine_time_hours,
  ml.maximum_output,
  ml.standard_output,
  CASE
    WHEN COALESCE(ml.machine_time_hours,0)<=0 THEN 'NO_POSITIVE_MACHINE_HOURS'
    WHEN COALESCE(ml.maximum_output,0)<=0 AND COALESCE(ml.standard_output,0)<=0 THEN 'NO_VALID_OUTPUT_RATE'
    WHEN COALESCE(ml.maximum_output,0)<0 OR COALESCE(ml.standard_output,0)<0 THEN 'NEGATIVE_PLAN_VALUE'
    ELSE 'CHECK'
  END AS diagnostic_reason
FROM production_reports r
JOIN production_report_machine_lines ml ON ml.report_id=r.id
WHERE r.work_date BETWEEN '2026-10-01' AND '2026-10-30'
  AND (
    COALESCE(ml.machine_time_hours,0)<=0
    OR (COALESCE(ml.maximum_output,0)<=0 AND COALESCE(ml.standard_output,0)<=0)
    OR COALESCE(ml.maximum_output,0)<0
    OR COALESCE(ml.standard_output,0)<0
  )
ORDER BY r.work_date,r.id,ml.id
LIMIT 500;

-- 3) Detect reports with machine lines whose summed line output conflicts with report actual output.
-- This is a review list, not proof that the values should be equal in every business scenario.
SELECT
  r.id AS report_id,
  r.work_date,
  r.process_id,
  r.operation_mode,
  r.actual_output,
  COUNT(ml.id) AS machine_line_count,
  SUM(COALESCE(ml.counted_output,0)) AS sum_machine_counted_output,
  SUM(COALESCE(ml.maximum_output,0)) AS sum_machine_maximum_output,
  SUM(COALESCE(ml.machine_time_hours,0)) AS sum_machine_hours
FROM production_reports r
JOIN production_report_machine_lines ml ON ml.report_id=r.id
WHERE r.work_date BETWEEN '2026-10-01' AND '2026-10-30'
GROUP BY r.id,r.work_date,r.process_id,r.operation_mode,r.actual_output
HAVING COUNT(ml.id)>1
   OR ABS(COALESCE(r.actual_output,0)-SUM(COALESCE(ml.counted_output,0)))>0
ORDER BY r.work_date,r.id
LIMIT 500;

-- 4) Summary of negative/zero/null plan fields across the period.
SELECT
  COUNT(*) AS machine_line_count,
  SUM(CASE WHEN COALESCE(ml.machine_time_hours,0)<=0 THEN 1 ELSE 0 END) AS nonpositive_machine_hours,
  SUM(CASE WHEN COALESCE(ml.maximum_output,0)<=0 THEN 1 ELSE 0 END) AS nonpositive_maximum_output,
  SUM(CASE WHEN COALESCE(ml.standard_output,0)<=0 THEN 1 ELSE 0 END) AS nonpositive_standard_output,
  SUM(CASE WHEN COALESCE(ml.maximum_output,0)<0 OR COALESCE(ml.standard_output,0)<0 THEN 1 ELSE 0 END) AS negative_plan_values
FROM production_report_machine_lines ml
JOIN production_reports r ON r.id=ml.report_id
WHERE r.work_date BETWEEN '2026-10-01' AND '2026-10-30';
