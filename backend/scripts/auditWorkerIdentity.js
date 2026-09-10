'use strict';

/**
 * Read-only audit for the canonical worker identity chain:
 * users -> workers -> production_reports(_temp).
 *
 * This script NEVER changes production data. It reports structural/data
 * anomalies that can make one worker appear under another worker's code/name.
 */
const db = require('../config/db');

const checks = [
  {
    code: 'WORKER_WITHOUT_USER',
    sql: `SELECT w.id AS worker_id, w.user_id, w.worker_code
          FROM workers w
          LEFT JOIN users u ON u.id = w.user_id
          WHERE u.id IS NULL
          ORDER BY w.id
          LIMIT 100`,
  },
  {
    code: 'USER_WITH_MULTIPLE_WORKERS',
    sql: `SELECT u.id AS user_id, u.username, u.full_name,
                 COUNT(w.id) AS worker_count,
                 GROUP_CONCAT(CONCAT(w.id, ':', COALESCE(w.worker_code, '')) ORDER BY w.id SEPARATOR ', ') AS workers
          FROM users u
          JOIN workers w ON w.user_id = u.id
          WHERE u.role = 'worker'
          GROUP BY u.id, u.username, u.full_name
          HAVING COUNT(w.id) > 1
          ORDER BY worker_count DESC, u.id
          LIMIT 100`,
  },
  {
    code: 'DUPLICATE_WORKER_CODE',
    sql: `SELECT TRIM(w.worker_code) AS worker_code,
                 COUNT(*) AS worker_count,
                 GROUP_CONCAT(CONCAT(w.id, ':', w.user_id) ORDER BY w.id SEPARATOR ', ') AS worker_refs
          FROM workers w
          WHERE w.worker_code IS NOT NULL AND TRIM(w.worker_code) <> ''
          GROUP BY TRIM(w.worker_code)
          HAVING COUNT(*) > 1
          ORDER BY worker_count DESC, worker_code
          LIMIT 100`,
  },
  {
    code: 'DUPLICATE_NORMALIZED_NUMERIC_WORKER_CODE',
    sql: `SELECT CAST(TRIM(w.worker_code) AS UNSIGNED) AS numeric_code,
                 COUNT(*) AS worker_count,
                 GROUP_CONCAT(CONCAT(w.id, ':', w.user_id, ':', w.worker_code) ORDER BY w.id SEPARATOR ', ') AS worker_refs
          FROM workers w
          WHERE w.worker_code IS NOT NULL
            AND TRIM(w.worker_code) REGEXP '^[0-9]+$'
          GROUP BY CAST(TRIM(w.worker_code) AS UNSIGNED)
          HAVING COUNT(*) > 1
          ORDER BY worker_count DESC, numeric_code
          LIMIT 100`,
  },
  {
    code: 'WORKER_CODE_EMPTY',
    sql: `SELECT w.id AS worker_id, w.user_id, w.worker_code
          FROM workers w
          JOIN users u ON u.id = w.user_id
          WHERE u.role = 'worker'
            AND (w.worker_code IS NULL OR TRIM(w.worker_code) = '')
          ORDER BY w.id
          LIMIT 100`,
  },
  {
    code: 'TEMP_REPORT_IDENTITY_COLLISION',
    sql: `SELECT pr.work_date, pr.shift, TRIM(w.worker_code) AS worker_code,
                 COUNT(DISTINCT pr.worker_id) AS worker_count,
                 COUNT(*) AS report_count,
                 GROUP_CONCAT(DISTINCT CONCAT(pr.worker_id, ':', u.full_name) ORDER BY pr.worker_id SEPARATOR ' | ') AS worker_refs
          FROM production_reports_temp pr
          JOIN workers w ON w.id = pr.worker_id
          JOIN users u ON u.id = w.user_id
          WHERE pr.status IN ('pending', 'need_fix')
            AND w.worker_code IS NOT NULL
            AND TRIM(w.worker_code) <> ''
          GROUP BY pr.work_date, pr.shift, TRIM(w.worker_code)
          HAVING COUNT(DISTINCT pr.worker_id) > 1
          ORDER BY pr.work_date DESC, worker_count DESC
          LIMIT 100`,
  },
  {
    code: 'APPROVED_REPORT_IDENTITY_COLLISION',
    sql: `SELECT pr.work_date, pr.shift, TRIM(w.worker_code) AS worker_code,
                 COUNT(DISTINCT pr.worker_id) AS worker_count,
                 COUNT(*) AS report_count,
                 GROUP_CONCAT(DISTINCT CONCAT(pr.worker_id, ':', u.full_name) ORDER BY pr.worker_id SEPARATOR ' | ') AS worker_refs
          FROM production_reports pr
          JOIN workers w ON w.id = pr.worker_id
          JOIN users u ON u.id = w.user_id
          WHERE pr.status = 'approved'
            AND w.worker_code IS NOT NULL
            AND TRIM(w.worker_code) <> ''
          GROUP BY pr.work_date, pr.shift, TRIM(w.worker_code)
          HAVING COUNT(DISTINCT pr.worker_id) > 1
          ORDER BY pr.work_date DESC, worker_count DESC
          LIMIT 100`,
  },
  {
    code: 'TEMP_REPORT_WORKER_ORPHAN',
    sql: `SELECT pr.id, pr.worker_id, pr.work_date, pr.status
          FROM production_reports_temp pr
          LEFT JOIN workers w ON w.id = pr.worker_id
          WHERE w.id IS NULL
          ORDER BY pr.id DESC
          LIMIT 100`,
  },
  {
    code: 'APPROVED_REPORT_WORKER_ORPHAN',
    sql: `SELECT pr.id, pr.worker_id, pr.work_date, pr.status
          FROM production_reports pr
          LEFT JOIN workers w ON w.id = pr.worker_id
          WHERE w.id IS NULL
          ORDER BY pr.id DESC
          LIMIT 100`,
  },
];

async function run() {
  await db.testConnection();
  let failed = 0;

  console.log('[KTC] Worker identity audit (read-only)');

  for (const check of checks) {
    const [rows] = await db.promise().query(check.sql);
    const bad = rows.length > 0;
    console.log(`[${bad ? 'FAIL' : 'OK'}] ${check.code}: ${rows.length}`);
    if (bad) {
      failed += 1;
      for (const row of rows.slice(0, 10)) console.log(`  ${JSON.stringify(row)}`);
      if (rows.length > 10) console.log(`  ... ${rows.length - 10} more`);
    }
  }

  if (failed) {
    const error = new Error(`Worker identity audit found ${failed} anomalous check(s)`);
    error.code = 'WORKER_IDENTITY_AUDIT_FAILED';
    throw error;
  }

  console.log(`[KTC] Worker identity audit OK (${checks.length} checks)`);
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => undefined);
  });
