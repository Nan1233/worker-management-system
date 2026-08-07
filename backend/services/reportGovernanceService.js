const db = require('../config/db');

const q = async (sql, params = [], executor = db.promise()) => {
  const [rows] = await executor.query(sql, params);
  return rows;
};

function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

async function isPeriodLocked(workDate, processId, executor = db.promise()) {
  const date = normalizeDate(workDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const rows = await q(
    `SELECT id FROM reporting_period_locks
     WHERE report_year = YEAR(?) AND report_month = MONTH(?)
       AND status = 'locked'
       AND (process_id IS NULL OR process_id = ?)
     LIMIT 1`,
    [date, date, Number(processId)], executor
  );
  return rows.length > 0;
}

async function createApprovedSnapshot(reportId, createdBy, executor = db.promise()) {
  const reports = await q(
    `SELECT pr.*, w.worker_code, u.full_name, p.process_code, p.process_name,
            ps.id AS product_standard_id,
            COALESCE(ps.exclude_kqd_from_tt, 0) AS exclude_kqd_from_tt
     FROM production_reports pr
     JOIN workers w ON w.id = pr.worker_id
     JOIN users u ON u.id = w.user_id
     JOIN processes p ON p.id = pr.process_id
     LEFT JOIN product_standards ps
       ON ps.process_id = pr.process_id AND ps.product_code = pr.product_name
     WHERE pr.id = ? LIMIT 1`,
    [reportId], executor
  );
  if (!reports[0]) throw new Error('Không tìm thấy báo cáo để tạo snapshot');
  const report = reports[0];

  const [defects, deductions, versions] = await Promise.all([
    q(`SELECT dt.defect_code, dt.defect_name, d.quantity
       FROM production_report_defects d
       LEFT JOIN defect_types dt ON dt.id=d.defect_type_id
       WHERE d.report_id=? ORDER BY d.id`, [reportId], executor),
    q(`SELECT dt.deduction_code, dt.deduction_name, d.hours
       FROM production_report_deductions d
       LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id
       WHERE d.report_id=? ORDER BY d.id`, [reportId], executor),
    q(`SELECT id FROM product_standard_versions
       WHERE process_id=? AND product_code=? AND status='active'
         AND effective_from <= ?
         AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from DESC, version_no DESC LIMIT 1`,
      [report.process_id, report.product_name, normalizeDate(report.work_date), normalizeDate(report.work_date)], executor)
  ]);

  const snapshot = {
    report: {
      id: report.id,
      worker_id: report.worker_id,
      worker_code: report.worker_code,
      worker_name: report.full_name,
      process_id: report.process_id,
      process_code: report.process_code,
      process_name: report.process_name,
      work_date: normalizeDate(report.work_date),
      shift: report.shift,
      machine_no: report.machine_no,
      product_code: report.product_name,
      total_time: Number(report.total_time || 0),
      actual_time: Number(report.actual_time || 0),
      deduction_time: Number(report.deduction_time || 0),
      standard_output: Number(report.standard_output || 0),
      actual_output: Number(report.actual_output || 0),
      tt_ok: Number(report.tt_ok || 0),
      tt_ng: Number(report.tt_ng || 0),
      exclude_kqd_from_tt: Number(report.exclude_kqd_from_tt || 0)
    },
    defects,
    deductions
  };

  await q(
    `INSERT INTO production_report_snapshots
     (report_id, snapshot_type, standard_version_id, calculation_version, snapshot_data, created_by)
     VALUES (?, 'approved', ?, 'v1', ?, ?)
     ON DUPLICATE KEY UPDATE snapshot_data=VALUES(snapshot_data),
       standard_version_id=VALUES(standard_version_id), created_by=VALUES(created_by), created_at=CURRENT_TIMESTAMP`,
    [reportId, versions[0]?.id || null, JSON.stringify(snapshot), createdBy || null], executor
  );
  return snapshot;
}

module.exports = { isPeriodLocked, createApprovedSnapshot };
