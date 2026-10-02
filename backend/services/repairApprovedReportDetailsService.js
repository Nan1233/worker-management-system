const db = require('../config/db');

function normalizeDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

async function repairApprovedReportDetails({ dateFrom = null, dateTo = null, limit = 5000, execute = false } = {}) {
  const from = normalizeDate(dateFrom);
  const to = normalizeDate(dateTo);
  const safeLimit = Math.min(Math.max(Number(limit) || 5000, 1), 20000);

  const where = [
    "r.status='approved'",
    'r.source_temp_id IS NOT NULL',
    'r.source_temp_id > 0',
  ];
  const params = [];
  if (from) { where.push('r.work_date >= ?'); params.push(from); }
  if (to) { where.push('r.work_date <= ?'); params.push(to); }
  params.push(safeLimit);

  const [reports] = await db.promise().query(`
    SELECT r.id, r.source_temp_id, r.work_date, r.worker_id
      FROM production_reports r
     WHERE ${where.join(' AND ')}
     ORDER BY r.id ASC
     LIMIT ?
  `, params);

  const summary = {
    mode: execute ? 'execute' : 'dry-run',
    scanned: reports.length,
    candidates: 0,
    repaired: 0,
    skippedAlreadyPresent: 0,
    skippedNoTempDetails: 0,
    copiedDeductions: 0,
    copiedDefects: 0,
    reports: [],
  };

  for (const report of reports) {
    const approvedId = Number(report.id);
    const tempId = Number(report.source_temp_id);
    const [[counts]] = await db.promise().query(`
      SELECT
        (SELECT COUNT(*) FROM production_report_deductions WHERE report_id=?) AS approved_deductions,
        (SELECT COUNT(*) FROM production_temp_deductions WHERE temp_report_id=?) AS temp_deductions,
        (SELECT COUNT(*) FROM production_report_defects WHERE report_id=?) AS approved_defects,
        (SELECT COUNT(*) FROM production_temp_defects WHERE temp_report_id=?) AS temp_defects
    `, [approvedId, tempId, approvedId, tempId]);

    const approvedDeductions = Number(counts.approved_deductions || 0);
    const tempDeductions = Number(counts.temp_deductions || 0);
    const approvedDefects = Number(counts.approved_defects || 0);
    const tempDefects = Number(counts.temp_defects || 0);

    const missingDeductions = approvedDeductions === 0 && tempDeductions > 0;
    const missingDefects = approvedDefects === 0 && tempDefects > 0;

    if (!missingDeductions && !missingDefects) {
      if (approvedDeductions || approvedDefects) summary.skippedAlreadyPresent += 1;
      else summary.skippedNoTempDetails += 1;
      continue;
    }

    summary.candidates += 1;
    const item = {
      approvedId,
      tempId,
      workDate: report.work_date,
      approvedDeductions,
      tempDeductions,
      approvedDefects,
      tempDefects,
      copiedDeductions: 0,
      copiedDefects: 0,
    };

    if (execute) {
      const connection = await db.promise().getConnection();
      try {
        await connection.beginTransaction();
        if (missingDeductions) {
          const [result] = await connection.query(`
            INSERT INTO production_report_deductions (report_id, deduction_type_id, hours)
            SELECT ?, deduction_type_id, hours
              FROM production_temp_deductions
             WHERE temp_report_id=?
          `, [approvedId, tempId]);
          item.copiedDeductions = Number(result.affectedRows || 0);
        }
        if (missingDefects) {
          const [result] = await connection.query(`
            INSERT INTO production_report_defects (report_id, defect_type_id, quantity)
            SELECT ?, defect_type_id, quantity
              FROM production_temp_defects
             WHERE temp_report_id=?
          `, [approvedId, tempId]);
          item.copiedDefects = Number(result.affectedRows || 0);
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
      if (item.copiedDeductions || item.copiedDefects) summary.repaired += 1;
      summary.copiedDeductions += item.copiedDeductions;
      summary.copiedDefects += item.copiedDefects;
    }

    summary.reports.push(item);
  }

  return summary;
}

module.exports = { repairApprovedReportDetails };
