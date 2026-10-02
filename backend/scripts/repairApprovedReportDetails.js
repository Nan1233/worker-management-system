const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: '.env.local' });
dotenv.config();

function first(...names) {
  for (const name of names) {
    const value = String(process.env[name] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function buildSsl() {
  const enabled = ['true', '1', 'yes'].includes(first('TIDB_ENABLE_SSL', 'DB_SSL').toLowerCase());
  if (!enabled) return undefined;
  const caPath = first('TIDB_CA_PATH', 'DB_SSL_CA');
  const ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
  if (caPath && fs.existsSync(caPath)) ssl.ca = fs.readFileSync(caPath);
  return ssl;
}

function connectionOptions() {
  const url = first('TIDB_DATABASE_URL', 'TIDB_URL', 'DATABASE_URL', 'DB_URL');
  if (url) {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('ssl') && ['true', '1', 'yes'].includes(first('TIDB_ENABLE_SSL').toLowerCase())) {
      parsed.searchParams.set('ssl', JSON.stringify({ minVersion: 'TLSv1.2' }));
    }
    return {
      uri: parsed.toString(),
      host: parsed.hostname,
      port: Number(parsed.port || 4000),
      user: decodeURIComponent(parsed.username),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
      password: decodeURIComponent(parsed.password),
    };
  }

  const host = first('TIDB_HOST', 'DB_HOST');
  const port = Number(first('TIDB_PORT', 'DB_PORT') || 4000);
  const user = first('TIDB_USER', 'DB_USER');
  const password = first('TIDB_PASSWORD', 'DB_PASSWORD');
  const database = first('TIDB_DATABASE', 'DB_NAME');

  if (!host || !user || !database) {
    throw new Error('Thiếu cấu hình TiDB: cần TIDB_DATABASE_URL/TIDB_URL hoặc TIDB_HOST + TIDB_USER + TIDB_PASSWORD + TIDB_DATABASE');
  }

  return { host, port, user, password, database, ssl: buildSsl() };
}

async function main() {
  const options = connectionOptions();
  console.log('[KTC] repairApprovedReportDetails connecting', {
    host: options.host,
    port: options.port,
    database: options.database,
    user: options.user,
  });

  const conn = await mysql.createConnection(options);
  try {
    const [reports] = await conn.query(`
      SELECT id, source_temp_id, work_date, worker_id
      FROM production_reports
      WHERE status='approved'
        AND source_temp_id IS NOT NULL
        AND source_temp_id > 0
      ORDER BY id
    `);

    let repaired = 0;
    let copiedDeductions = 0;
    let copiedDefects = 0;

    for (const report of reports) {
      const approvedId = Number(report.id);
      const tempId = Number(report.source_temp_id);

      await conn.beginTransaction();
      try {
        const [[counts]] = await conn.query(`
          SELECT
            (SELECT COUNT(*) FROM production_report_deductions WHERE report_id=?) AS approved_deductions,
            (SELECT COUNT(*) FROM production_temp_deductions WHERE temp_report_id=?) AS temp_deductions,
            (SELECT COUNT(*) FROM production_report_defects WHERE report_id=?) AS approved_defects,
            (SELECT COUNT(*) FROM production_temp_defects WHERE temp_report_id=?) AS temp_defects
        `, [approvedId, tempId, approvedId, tempId]);

        let rowCopiedDeductions = 0;
        let rowCopiedDefects = 0;

        if (Number(counts.approved_deductions) === 0 && Number(counts.temp_deductions) > 0) {
          const [result] = await conn.query(`
            INSERT INTO production_report_deductions (report_id, deduction_type_id, hours)
            SELECT ?, deduction_type_id, hours
            FROM production_temp_deductions
            WHERE temp_report_id=?
          `, [approvedId, tempId]);
          rowCopiedDeductions = Number(result.affectedRows || 0);
        }

        if (Number(counts.approved_defects) === 0 && Number(counts.temp_defects) > 0) {
          const [result] = await conn.query(`
            INSERT INTO production_report_defects (report_id, defect_type_id, quantity)
            SELECT ?, defect_type_id, quantity
            FROM production_temp_defects
            WHERE temp_report_id=?
          `, [approvedId, tempId]);
          rowCopiedDefects = Number(result.affectedRows || 0);
        }

        await conn.commit();

        if (rowCopiedDeductions || rowCopiedDefects) {
          repaired += 1;
          copiedDeductions += rowCopiedDeductions;
          copiedDefects += rowCopiedDefects;
          console.log('[KTC] repaired approved report details', {
            approvedId,
            tempId,
            copiedDeductions: rowCopiedDeductions,
            copiedDefects: rowCopiedDefects,
          });
        }
      } catch (error) {
        await conn.rollback();
        throw error;
      }
    }

    console.log(JSON.stringify({
      scanned: reports.length,
      repaired,
      copiedDeductions,
      copiedDefects,
    }, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('[KTC] repairApprovedReportDetails failed:', error);
  process.exitCode = 1;
});
