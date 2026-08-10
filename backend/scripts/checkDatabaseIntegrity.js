'use strict';

const db = require('../config/db');

const checks = [
  {
    code: 'WORKER_USER_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM workers w LEFT JOIN users u ON u.id=w.user_id WHERE u.id IS NULL`,
  },
  {
    code: 'WORKER_PROCESS_WORKER_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM worker_processes wp LEFT JOIN workers w ON w.id=wp.worker_id WHERE w.id IS NULL`,
  },
  {
    code: 'WORKER_PROCESS_PROCESS_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM worker_processes wp LEFT JOIN processes p ON p.id=wp.process_id WHERE p.id IS NULL`,
  },
  {
    code: 'MANAGER_PROCESS_USER_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM manager_processes mp LEFT JOIN users u ON u.id=mp.manager_id WHERE u.id IS NULL`,
  },
  {
    code: 'TEMP_REPORT_WORKER_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_reports_temp r LEFT JOIN workers w ON w.id=r.worker_id WHERE w.id IS NULL`,
  },
  {
    code: 'TEMP_REPORT_PROCESS_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_reports_temp r LEFT JOIN processes p ON p.id=r.process_id WHERE p.id IS NULL`,
  },
  {
    code: 'APPROVED_REPORT_WORKER_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_reports r LEFT JOIN workers w ON w.id=r.worker_id WHERE w.id IS NULL`,
  },
  {
    code: 'APPROVED_REPORT_PROCESS_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_reports r LEFT JOIN processes p ON p.id=r.process_id WHERE p.id IS NULL`,
  },
  {
    code: 'APPROVED_SOURCE_TEMP_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_reports r LEFT JOIN production_reports_temp t ON t.id=r.source_temp_id WHERE r.source_temp_id IS NOT NULL AND t.id IS NULL`,
  },
  {
    code: 'TEMP_DEFECT_REPORT_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_temp_defects d LEFT JOIN production_reports_temp r ON r.id=d.temp_report_id WHERE r.id IS NULL`,
  },
  {
    code: 'TEMP_DEFECT_TYPE_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_temp_defects d LEFT JOIN defect_types t ON t.id=d.defect_type_id WHERE t.id IS NULL`,
  },
  {
    code: 'APPROVED_DEFECT_REPORT_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_report_defects d LEFT JOIN production_reports r ON r.id=d.report_id WHERE r.id IS NULL`,
  },
  {
    code: 'APPROVED_DEFECT_TYPE_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_report_defects d LEFT JOIN defect_types t ON t.id=d.defect_type_id WHERE t.id IS NULL`,
  },
  {
    code: 'TEMP_DEDUCTION_REPORT_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_temp_deductions d LEFT JOIN production_reports_temp r ON r.id=d.temp_report_id WHERE r.id IS NULL`,
  },
  {
    code: 'TEMP_DEDUCTION_TYPE_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_temp_deductions d LEFT JOIN deduction_types t ON t.id=d.deduction_type_id WHERE t.id IS NULL`,
  },
  {
    code: 'APPROVED_DEDUCTION_REPORT_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_report_deductions d LEFT JOIN production_reports r ON r.id=d.report_id WHERE r.id IS NULL`,
  },
  {
    code: 'APPROVED_DEDUCTION_TYPE_ORPHAN',
    sql: `SELECT COUNT(*) AS total FROM production_report_deductions d LEFT JOIN deduction_types t ON t.id=d.deduction_type_id WHERE t.id IS NULL`,
  },
  {
    code: 'INVALID_TRAINING_PERCENT',
    sql: `SELECT COUNT(*) AS total FROM workers WHERE training_percent < 0 OR training_percent > 100`,
  },
  {
    code: 'INVALID_REPORT_TIME',
    sql: `SELECT COUNT(*) AS total FROM production_reports_temp WHERE total_time < 0 OR actual_time < 0 OR deduction_time < 0 OR total_time > 12.0001`,
  },
  {
    code: 'INVALID_APPROVED_REPORT_TIME',
    sql: `SELECT COUNT(*) AS total FROM production_reports WHERE total_time < 0 OR actual_time < 0 OR deduction_time < 0 OR total_time > 12.0001`,
  },
];

async function run() {
  await db.testConnection();
  let failed = 0;
  for (const check of checks) {
    const [rows] = await db.promise().query(check.sql);
    const total = Number(rows[0]?.total || 0);
    const state = total === 0 ? 'OK' : 'FAIL';
    console.log(`[${state}] ${check.code}: ${total}`);
    if (total !== 0) failed += 1;
  }

  if (failed) {
    const error = new Error(`Database integrity failed: ${failed} check(s) have invalid rows`);
    error.code = 'DATABASE_INTEGRITY_FAILED';
    throw error;
  }
  console.log(`[KTC] Database integrity OK (${checks.length} checks)`);
}

run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.closePool().catch(() => undefined);
  });
