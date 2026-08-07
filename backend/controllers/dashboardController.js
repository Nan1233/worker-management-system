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

    const machineScope = req.user.role === "admin"
      ? { clause: "", params: [] }
      : { clause: "AND EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.manager_id=? AND mp.process_id=r.process_id)", params: [req.user.id] };
    const [[machineTotals], [workerTotals], [machineRows]] = await Promise.all([
      db.promise().query(
        `SELECT COUNT(DISTINCT ml.machine_id) AS machine_count,
                COUNT(*) AS machine_line_count,
                COALESCE(SUM(ml.machine_time_hours),0) AS total_machine_hours,
                COALESCE(SUM(ml.maximum_output),0) AS maximum_output,
                COALESCE(SUM(ml.counted_output),0) AS counted_output,
                COALESCE(SUM(ml.ok_quantity),0) AS machine_ok,
                COALESCE(SUM(ml.ng_quantity),0) AS machine_ng
         FROM production_report_machine_lines ml
         JOIN production_reports r ON r.id=ml.report_id
         WHERE r.work_date BETWEEN ? AND ? ${machineScope.clause}`,
        [from, to, ...machineScope.params],
      ),
      db.promise().query(
        `SELECT COALESCE(SUM(r.actual_time),0) AS actual_worker_hours,
                COALESCE(SUM(x.earned_standard_hours),0) AS earned_standard_hours
         FROM production_reports r
         LEFT JOIN (
           SELECT report_id, SUM(earned_standard_hours) AS earned_standard_hours
           FROM production_report_machine_lines GROUP BY report_id
         ) x ON x.report_id=r.id
         WHERE r.work_date BETWEEN ? AND ? ${machineScope.clause}`,
        [from, to, ...machineScope.params],
      ),
      db.promise().query(
        `SELECT ml.machine_id, ml.machine_code,
                COUNT(*) AS run_count,
                COALESCE(SUM(ml.machine_time_hours),0) AS machine_hours,
                COALESCE(SUM(ml.maximum_output),0) AS maximum_output,
                COALESCE(SUM(ml.counted_output),0) AS counted_output,
                COALESCE(SUM(ml.ok_quantity),0) AS ok,
                COALESCE(SUM(ml.ng_quantity),0) AS ng
         FROM production_report_machine_lines ml
         JOIN production_reports r ON r.id=ml.report_id
         WHERE r.work_date BETWEEN ? AND ? ${machineScope.clause}
         GROUP BY ml.machine_id, ml.machine_code
         ORDER BY ml.machine_code`,
        [from, to, ...machineScope.params],
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
        machine_performance: {
          machine_count: mapNumber(machineTotals?.machine_count),
          machine_line_count: mapNumber(machineTotals?.machine_line_count),
          total_machine_hours: mapNumber(machineTotals?.total_machine_hours),
          maximum_output: mapNumber(machineTotals?.maximum_output),
          counted_output: mapNumber(machineTotals?.counted_output),
          total_ok: mapNumber(machineTotals?.machine_ok),
          total_ng: mapNumber(machineTotals?.machine_ng),
          efficiency_percent: mapNumber(machineTotals?.maximum_output) > 0
            ? mapNumber(machineTotals?.counted_output) / mapNumber(machineTotals?.maximum_output) * 100 : 0,
        },
        worker_performance: {
          actual_worker_hours: mapNumber(workerTotals?.actual_worker_hours),
          earned_standard_hours: mapNumber(workerTotals?.earned_standard_hours),
          efficiency_percent: mapNumber(workerTotals?.actual_worker_hours) > 0
            ? mapNumber(workerTotals?.earned_standard_hours) / mapNumber(workerTotals?.actual_worker_hours) * 100 : 0,
        },
        machine_summary: machineRows.map((row) => ({
          machine_id: Number(row.machine_id), machine_code: row.machine_code,
          run_count: mapNumber(row.run_count), machine_hours: mapNumber(row.machine_hours),
          maximum_output: mapNumber(row.maximum_output), counted_output: mapNumber(row.counted_output),
          ok: mapNumber(row.ok), ng: mapNumber(row.ng),
          efficiency_percent: mapNumber(row.maximum_output) > 0 ? mapNumber(row.counted_output) / mapNumber(row.maximum_output) * 100 : 0,
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
