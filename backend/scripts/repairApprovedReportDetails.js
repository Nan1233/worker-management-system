const db = require('../config/db');

const query = (conn, sql, params = []) => conn.query(sql, params);

async function repairReport(conn, report) {
  const approvedId = Number(report.id);
  const tempId = Number(report.source_temp_id);

  await conn.beginTransaction();

  try {
    const [[counts]] = await query(conn, `
      SELECT
        (SELECT COUNT(*) FROM production_report_deductions WHERE report_id=?) AS approved_deductions,
        (SELECT COUNT(*) FROM production_temp_deductions WHERE temp_report_id=?) AS temp_deductions,
        (SELECT COUNT(*) FROM production_report_defects WHERE report_id=?) AS approved_defects,
        (SELECT COUNT(*) FROM production_temp_defects WHERE temp_report_id=?) AS temp_defects
    `, [approvedId, tempId, approvedId, tempId]);

    let copiedDeductions = 0;
    let copiedDefects = 0;

    if (Number(counts.approved_deductions) === 0 && Number(counts.temp_deductions) > 0) {
      const [result] = await query(conn, `
        INSERT INTO production_report_deductions (report_id, deduction_type_id, hours)
        SELECT ?, deduction_type_id, hours
        FROM production_temp_deductions
        WHERE temp_report_id=?
      `, [approvedId, tempId]);

      copiedDeductions = Number(result.affectedRows || 0);
    }

    if (Number(counts.approved_defects) === 0 && Number(counts.temp_defects) > 0) {
      const [result] = await query(conn, `
        INSERT INTO production_report_defects (report_id, defect_type_id, quantity)
        SELECT ?, defect_type_id, quantity
        FROM production_temp_defects
        WHERE temp_report_id=?
      `, [approvedId, tempId]);

      copiedDefects = Number(result.affectedRows || 0);
    }

    await conn.commit();

    return {
      approvedId,
      tempId,
      approvedDeductions: Number(counts.approved_deductions),
      tempDeductions: Number(counts.temp_deductions),
      copiedDeductions,
      approvedDefects: Number(counts.approved_defects),
      tempDefects: Number(counts.temp_defects),
      copiedDefects,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}

async function main() {
  const conn = await db.promise().getConnection();

  try {
    const [reports] = await query(conn, `
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
      const result = await repairReport(conn, report);

      if (result.copiedDeductions || result.copiedDefects) {
        repaired += 1;
        copiedDeductions += result.copiedDeductions;
        copiedDefects += result.copiedDefects;

        console.log('[KTC] repaired approved report details', result);
      }
    }

    console.log(JSON.stringify({
      scanned: reports.length,
      repaired,
      copiedDeductions,
      copiedDefects,
    }, null, 2));
  } finally {
    conn.release();
  }
}

main().catch((error) => {
  console.error('[KTC] repairApprovedReportDetails failed:', error);
  process.exitCode = 1;
});
