-- KTC / Mài - Đo: read-only verification for the template-aligned fields.
-- No ALTER/UPDATE is required: the related grinding machine is stored in the
-- existing production_reports_temp.extra_data / production_reports.extra_data JSON.

-- 1) Confirm the existing JSON storage columns are present.
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('production_reports_temp', 'production_reports')
  AND COLUMN_NAME = 'extra_data'
ORDER BY TABLE_NAME;

-- 2) Confirm active Mài and Đo machine masters used by the form.
SELECT p.process_code, p.process_name, m.id AS machine_id, m.machine_code, m.machine_name, m.status
FROM processes p
JOIN machines m ON m.process_id = p.id
WHERE UPPER(p.process_code) IN ('MAI', 'DO')
  AND LOWER(COALESCE(m.status, 'active')) IN ('active', 'enabled', '1')
ORDER BY p.process_code, m.machine_code;

-- 3) Review saved Đo reports that carry the related grinding machine.
SELECT id, work_date, worker_id, machine_no AS machine_do,
       JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.grinding_machine_no')) AS machine_mai,
       status
FROM production_reports
WHERE process_id = (SELECT id FROM processes WHERE UPPER(process_code) = 'DO' LIMIT 1)
  AND JSON_EXTRACT(extra_data, '$.grinding_machine_no') IS NOT NULL
ORDER BY work_date DESC, id DESC
LIMIT 100;
