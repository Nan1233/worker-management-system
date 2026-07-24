const db = require("../config/db");
const { TtlCache } = require("../utils/cache");

const dashboardCache = new TtlCache({ maxEntries: 250 });
const DASHBOARD_CACHE_TTL_MS = Number(process.env.DASHBOARD_CACHE_TTL_MS || 30_000);
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

function getScopeSql(user, alias = "r") {
  if (user.role === "admin") return { clause: "", params: [] };
  return {
    clause: `AND EXISTS (
      SELECT 1 FROM manager_processes mp
      WHERE mp.manager_id = ? AND mp.process_id = ${alias}.process_id
    )`,
    params: [user.id],
  };
}

function mapNumber(value) {
  return Number(value || 0);
}

exports.clearDashboardCache = () => dashboardCache.clear();

exports.getSummary = async (req, res, next) => {
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");

  if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
    return res.status(400).json({ success: false, message: "Khoảng thời gian không hợp lệ" });
  }

  const cacheKey = `dashboard:${req.user.role}:${req.user.id}:${from}:${to}`;
  const cached = dashboardCache.get(cacheKey);
  if (cached) {
    res.setHeader("X-KTC-Cache", "HIT");
    return res.json(cached);
  }

  try {
    const scope = getScopeSql(req.user);
    const processScope = req.user.role === "admin"
      ? { clause: "", params: [] }
      : {
          clause: "AND EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.manager_id=? AND mp.process_id=p.id)",
          params: [req.user.id],
        };

    // Independent aggregate queries run in parallel. The pool limits actual
    // concurrency so Render remains stable while dashboard latency decreases.
    const [
      [processes],
      [pendingRows],
      [totalsRows],
      [processRows],
      [dailyRows],
      [shiftRows],
    ] = await Promise.all([
      db.promise().query(
        `SELECT p.id, p.process_code, p.process_name
         FROM processes p
         WHERE p.status='active' ${processScope.clause}
         ORDER BY p.process_name`,
        processScope.params,
      ),
      db.promise().query(
        `SELECT COUNT(*) AS pending_count
         FROM production_reports_temp r
         WHERE r.work_date BETWEEN ? AND ?
           AND r.status IN ('pending','need_fix')
           ${scope.clause}`,
        [from, to, ...scope.params],
      ),
      db.promise().query(
        `SELECT COUNT(*) AS approved_count,
                COALESCE(SUM(r.tt_ok),0) AS total_ok,
                COALESCE(SUM(r.tt_ng),0) AS total_ng
         FROM production_reports r
         WHERE r.work_date BETWEEN ? AND ? ${scope.clause}`,
        [from, to, ...scope.params],
      ),
      db.promise().query(
        `SELECT r.process_id, p.process_code, p.process_name,
                COUNT(*) AS report_count,
                COALESCE(SUM(r.tt_ok),0) AS ok,
                COALESCE(SUM(r.tt_ng),0) AS ng
         FROM production_reports r
         JOIN processes p ON p.id=r.process_id
         WHERE r.work_date BETWEEN ? AND ? ${scope.clause}
         GROUP BY r.process_id, p.process_code, p.process_name
         ORDER BY p.process_name`,
        [from, to, ...scope.params],
      ),
      db.promise().query(
        `SELECT DATE_FORMAT(r.work_date, '%Y-%m-%d') AS work_date,
                COUNT(*) AS report_count,
                COALESCE(SUM(r.tt_ok),0) AS ok,
                COALESCE(SUM(r.tt_ng),0) AS ng
         FROM production_reports r
         WHERE r.work_date BETWEEN ? AND ? ${scope.clause}
         GROUP BY r.work_date
         ORDER BY r.work_date`,
        [from, to, ...scope.params],
      ),
      db.promise().query(
        `SELECT COALESCE(NULLIF(TRIM(r.shift),''),'Chưa xác định') AS shift,
                COUNT(*) AS report_count,
                COALESCE(SUM(r.tt_ok),0) AS ok,
                COALESCE(SUM(r.tt_ng),0) AS ng
         FROM production_reports r
         WHERE r.work_date BETWEEN ? AND ? ${scope.clause}
         GROUP BY COALESCE(NULLIF(TRIM(r.shift),''),'Chưa xác định')
         ORDER BY shift`,
        [from, to, ...scope.params],
      ),
    ]);

    const totals = totalsRows[0] || {};
    const totalOk = mapNumber(totals.total_ok);
    const totalNg = mapNumber(totals.total_ng);
    const total = totalOk + totalNg;

    const payload = {
      success: true,
      data: {
        from,
        to,
        pending_count: mapNumber(pendingRows[0]?.pending_count),
        approved_count: mapNumber(totals.approved_count),
        total_ok: totalOk,
        total_ng: totalNg,
        ng_rate: total > 0 ? (totalNg / total) * 100 : 0,
        processes,
        process_summary: processRows.map((row) => ({
          process_id: Number(row.process_id),
          process_code: row.process_code,
          process_name: row.process_name,
          report_count: mapNumber(row.report_count),
          ok: mapNumber(row.ok),
          ng: mapNumber(row.ng),
        })),
        shift_summary: shiftRows.map((row) => ({
          shift: row.shift,
          report_count: mapNumber(row.report_count),
          ok: mapNumber(row.ok),
          ng: mapNumber(row.ng),
        })),
        daily_summary: dailyRows.map((row) => ({
          work_date: row.work_date,
          report_count: mapNumber(row.report_count),
          ok: mapNumber(row.ok),
          ng: mapNumber(row.ng),
        })),
      },
    };

    dashboardCache.set(cacheKey, payload, DASHBOARD_CACHE_TTL_MS);
    res.setHeader("X-KTC-Cache", "MISS");
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
};
