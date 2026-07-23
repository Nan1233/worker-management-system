const db = require('../config/db');

const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

function getScopeSql(user) {
  if (user.role === 'admin') return { clause: '', params: [] };
  return {
    clause: 'AND EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.manager_id = ? AND mp.process_id = r.process_id)',
    params: [user.id]
  };
}

exports.getSummary = async (req, res, next) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
    return res.status(400).json({ success: false, message: 'Khoảng thời gian không hợp lệ' });
  }

  const connection = await db.promise().getConnection();
  try {
    const scope = getScopeSql(req.user);

    const [processes] = await connection.query(
      `SELECT p.id, p.process_code, p.process_name
       FROM processes p
       WHERE p.status='active'
       ${req.user.role === 'admin' ? '' : 'AND EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.manager_id=? AND mp.process_id=p.id)'}
       ORDER BY p.process_name`,
      req.user.role === 'admin' ? [] : [req.user.id]
    );

    const [pendingRows] = await connection.query(
      `SELECT COUNT(*) AS pending_count
       FROM production_reports_temp r
       WHERE r.report_date BETWEEN ? AND ?
         AND r.status IN ('pending','need_fix')
         ${scope.clause}`,
      [from, to, ...scope.params]
    );

    const [totalsRows] = await connection.query(
      `SELECT COUNT(*) AS approved_count,
              COALESCE(SUM(r.tt_ok),0) AS total_ok,
              COALESCE(SUM(r.tt_ng),0) AS total_ng
       FROM production_reports r
       WHERE r.report_date BETWEEN ? AND ?
         ${scope.clause}`,
      [from, to, ...scope.params]
    );

    const [processRows] = await connection.query(
      `SELECT r.process_id, p.process_code, p.process_name,
              COUNT(*) AS report_count,
              COALESCE(SUM(r.tt_ok),0) AS ok,
              COALESCE(SUM(r.tt_ng),0) AS ng
       FROM production_reports r
       JOIN processes p ON p.id=r.process_id
       WHERE r.report_date BETWEEN ? AND ?
         ${scope.clause}
       GROUP BY r.process_id, p.process_code, p.process_name`,
      [from, to, ...scope.params]
    );

    const [shiftRows] = await connection.query(
      `SELECT COALESCE(NULLIF(TRIM(r.shift),''),'Chưa xác định') AS shift,
              COUNT(*) AS report_count,
              COALESCE(SUM(r.tt_ok),0) AS ok,
              COALESCE(SUM(r.tt_ng),0) AS ng
       FROM production_reports r
       WHERE r.report_date BETWEEN ? AND ?
         ${scope.clause}
       GROUP BY COALESCE(NULLIF(TRIM(r.shift),''),'Chưa xác định')
       ORDER BY shift`,
      [from, to, ...scope.params]
    );

    const totals = totalsRows[0] || {};
    const totalOk = Number(totals.total_ok || 0);
    const totalNg = Number(totals.total_ng || 0);
    const total = totalOk + totalNg;

    return res.json({
      success: true,
      data: {
        from,
        to,
        pending_count: Number(pendingRows[0]?.pending_count || 0),
        approved_count: Number(totals.approved_count || 0),
        total_ok: totalOk,
        total_ng: totalNg,
        ng_rate: total > 0 ? (totalNg / total) * 100 : 0,
        processes,
        process_summary: processRows.map((row) => ({
          process_id: Number(row.process_id),
          process_code: row.process_code,
          process_name: row.process_name,
          report_count: Number(row.report_count || 0),
          ok: Number(row.ok || 0),
          ng: Number(row.ng || 0)
        })),
        shift_summary: shiftRows.map((row) => ({
          shift: row.shift,
          report_count: Number(row.report_count || 0),
          ok: Number(row.ok || 0),
          ng: Number(row.ng || 0)
        }))
      }
    });
  } catch (error) {
    return next(error);
  } finally {
    connection.release();
  }
};
