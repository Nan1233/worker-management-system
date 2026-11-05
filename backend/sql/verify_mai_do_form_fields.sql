-- KTC / Mài - Đo: read-only DB verification.
-- extra_data is the existing JSON extension point; this script does not alter production data.

-- 1) Confirm JSON and per-machine standard snapshot columns exist.
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME IN ('production_reports_temp', 'production_reports') AND COLUMN_NAME = 'extra_data')
    OR (TABLE_NAME IN ('production_temp_machine_lines', 'production_report_machine_lines') AND COLUMN_NAME IN ('standard_time_seconds', 'standard_output'))
  )
ORDER BY TABLE_NAME, COLUMN_NAME;

-- 2) Confirm canonical process IDs/codes used by FE and BE.
SELECT id, process_code, process_name, status
FROM processes
WHERE UPPER(process_code) IN ('MAI', 'DO')
ORDER BY process_code;

-- 3) Active machines available to the Mài and Đo forms.
SELECT p.process_code, p.process_name, m.id AS machine_id, m.machine_code, m.machine_name, m.status
FROM processes p
JOIN machines m ON m.process_id = p.id
WHERE UPPER(p.process_code) IN ('MAI', 'DO')
  AND LOWER(COALESCE(m.status, 'active')) = 'active'
ORDER BY p.process_code, m.machine_code;

-- 4) Verify saved Đo reports with their selected related Mài machine.
SELECT id, work_date, worker_id, machine_no AS machine_do,
       JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.grinding_machine_no')) AS machine_mai,
       status
FROM production_reports
WHERE process_id = (SELECT id FROM processes WHERE UPPER(process_code) = 'DO' LIMIT 1)
  AND JSON_EXTRACT(extra_data, '$.grinding_machine_no') IS NOT NULL
ORDER BY work_date DESC, id DESC
LIMIT 100;

-- 5) Verify Mài standard seconds persisted per approved machine line.
SELECT pr.id AS report_id, pr.work_date, pr.worker_id, ml.machine_code, ml.product_code,
       ml.standard_time_seconds, ml.standard_output, ml.actual_time_hours, ml.ok_quantity, ml.ng_quantity
FROM production_reports pr
JOIN processes p ON p.id = pr.process_id
JOIN production_report_machine_lines ml ON ml.report_id = pr.id
WHERE UPPER(p.process_code) = 'MAI'
  AND pr.status = 'approved'
ORDER BY pr.work_date DESC, pr.id DESC, ml.id
LIMIT 100;
