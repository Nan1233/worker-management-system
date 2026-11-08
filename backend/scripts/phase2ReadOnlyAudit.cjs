'use strict';

// Phase 2 readiness audit. Never writes, changes schema, or prints worker rows.
// Use only a SELECT-only TiDB account on a dedicated test/staging database.
const READ_ONLY_CHECKS = Object.freeze([
  {
    id: 'PENDING_REPORTS',
    sql: "SELECT COUNT(*) AS total FROM production_reports_temp WHERE status IN ('pending','need_fix')",
    severity: 'info',
  },
  {
    id: 'APPROVED_REPORTS',
    sql: "SELECT COUNT(*) AS total FROM production_reports WHERE status='approved'",
    severity: 'info',
  },
  {
    id: 'DUPLICATE_APPROVED_SOURCE',
    sql: "SELECT COUNT(*) AS total FROM (SELECT source_temp_id FROM production_reports WHERE source_temp_id IS NOT NULL GROUP BY source_temp_id HAVING COUNT(*)>1) duplicates",
    severity: 'error',
  },
  {
    id: 'APPROVED_SOURCE_ORPHANS',
    sql: 'SELECT COUNT(*) AS total FROM production_reports a LEFT JOIN production_reports_temp t ON t.id=a.source_temp_id WHERE a.source_temp_id IS NOT NULL AND t.id IS NULL',
    severity: 'error',
  },
  {
    id: 'APPROVED_MACHINE_REPORTS_WITHOUT_LINES',
    sql: "SELECT COUNT(*) AS total FROM production_reports a LEFT JOIN production_report_machine_lines l ON l.report_id=a.id WHERE UPPER(TRIM(COALESCE(a.operation_mode,'')))='MACHINE' AND a.status='approved' GROUP BY a.id HAVING COUNT(l.id)=0",
    severity: 'error',
    countRows: true,
  },
  {
    id: 'TEMP_MACHINE_DEFECT_ORPHANS',
    sql: 'SELECT COUNT(*) AS total FROM production_temp_machine_defects d LEFT JOIN production_temp_machine_lines l ON l.id=d.machine_line_id WHERE l.id IS NULL',
    severity: 'error',
  },
  {
    id: 'APPROVED_MACHINE_DEFECT_ORPHANS',
    sql: 'SELECT COUNT(*) AS total FROM production_report_machine_defects d LEFT JOIN production_report_machine_lines l ON l.id=d.machine_line_id WHERE l.id IS NULL',
    severity: 'error',
  },
]);

function guardReadOnlySql(sql) {
  if (typeof sql !== 'string' || !/^SELECT\b/i.test(sql.trim())
      || /;|\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|TRUNCATE|CALL|EXECUTE|LOAD|INTO\s+OUTFILE|FOR\s+UPDATE)\b/i.test(sql)) {
    throw new Error('PHASE2_WRITE_OR_UNSAFE_QUERY_BLOCKED');
  }
}

function checkEnvironment(env) {
  if (env.KTC_PHASE2_READ_ONLY !== '1' || env.KTC_PHASE2_TARGET !== 'staging') {
    throw new Error('PHASE2_STAGING_READ_ONLY_CONFIRMATION_REQUIRED');
  }
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
  const missing = required.filter((name) => !String(env[name] || '').trim());
  if (missing.length) throw new Error('PHASE2_TEST_DB_CONNECTION_INCOMPLETE: ' + missing.join(', '));
}

async function runAudit(query) {
  const results = [];
  for (const check of READ_ONLY_CHECKS) {
    guardReadOnlySql(check.sql);
    const rows = await query(check.sql);
    const count = check.countRows ? rows.length : Number(rows[0]?.total);
    if (!Number.isFinite(count) || count < 0) {
      throw new Error('PHASE2_INVALID_QUERY_RESULT: ' + check.id);
    }
    results.push({ check: check.id, count, severity: check.severity, passed: check.severity !== 'error' || count === 0 });
  }
  return {
    read_only: true,
    environment: 'staging',
    passed: results.every((r) => r.passed),
    checks: results,
  };
}

async function main() {
  checkEnvironment(process.env);
  const db = require('../config/db');
  try {
    const outcome = await runAudit(async (sql) => {
      const [rows] = await db.promise().query(sql);
      return rows;
    });
    console.log(JSON.stringify(outcome, null, 2));
    if (!outcome.passed) process.exitCode = 1;
  } finally {
    await db.closePool().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    // Do not print the connection string, worker records, or error stack to CI.
    console.error('[KTC PHASE2] Read-only audit failed: ' + String(error?.code || error?.message || 'UNKNOWN').slice(0, 160));
    process.exitCode = 1;
  });
}

module.exports = { READ_ONLY_CHECKS, guardReadOnlySql, checkEnvironment, runAudit };
