-- KTC hotfix: allow one physical machine to appear on multiple product rows
-- in the same MAI temporary report.
--
-- The old UNIQUE(temp_report_id, machine_code) constraint rejects valid rows
-- such as machine M01 producing product A and then product B in one report.
-- Keep a normal lookup index; do not delete or rewrite existing report data.
--
-- Run once against the KTC TiDB database after confirming DATABASE() is the
-- intended environment (test first). The API error uq_temp_report_machine
-- confirms the old unique index is present.

SELECT DATABASE() AS current_database;

SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'production_temp_machine_lines'
  AND INDEX_NAME IN ('uq_temp_report_machine', 'idx_temp_report_machine_code')
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- Expected before: uq_temp_report_machine with NON_UNIQUE = 0.
-- Replace it with a non-unique composite index.
ALTER TABLE production_temp_machine_lines
  DROP INDEX uq_temp_report_machine,
  ADD INDEX idx_temp_report_machine_code (temp_report_id, machine_code);

-- Expected after: idx_temp_report_machine_code with NON_UNIQUE = 1.
SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'production_temp_machine_lines'
  AND INDEX_NAME = 'idx_temp_report_machine_code'
ORDER BY SEQ_IN_INDEX;

-- Read-only smoke check: same report may now have multiple product rows for
-- one machine. This query only inspects current data; it does not insert rows.
SELECT temp_report_id, machine_code, COUNT(*) AS line_count,
       COUNT(DISTINCT product_code) AS product_count
FROM production_temp_machine_lines
GROUP BY temp_report_id, machine_code
HAVING COUNT(*) > 1
ORDER BY temp_report_id DESC, machine_code
LIMIT 50;
