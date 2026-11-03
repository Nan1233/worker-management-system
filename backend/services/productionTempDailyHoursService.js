'use strict';

const db = require('../config/db');
const {
  DAILY_HOURS_LIMIT,
  DAILY_HOURS_EXCLUDED_PROCESS_CODES,
} = require('../utils/dailyHoursLimit');

async function getDailyHours(workerId, workDate) {
  const excludedPlaceholders = DAILY_HOURS_EXCLUDED_PROCESS_CODES.map(() => '?').join(', ');
  const [approvedRows] = await db.promise().query(
    `SELECT COALESCE(SUM(COALESCE(pr.actual_time, 0)), 0) AS counted_hours
       FROM production_reports pr
       JOIN processes p ON p.id = pr.process_id
      WHERE pr.worker_id = ? AND pr.work_date = ? AND pr.status = 'approved'
        AND p.process_code NOT IN (${excludedPlaceholders})`,
    [workerId, workDate, ...DAILY_HOURS_EXCLUDED_PROCESS_CODES],
  );
  const [tempRows] = await db.promise().query(
    `SELECT COALESCE(SUM(COALESCE(pr.actual_time, 0)), 0) AS counted_hours
       FROM production_reports_temp pr
       JOIN processes p ON p.id = pr.process_id
      WHERE pr.worker_id = ? AND pr.work_date = ? AND pr.status IN ('pending', 'need_fix')
        AND p.process_code NOT IN (${excludedPlaceholders})`,
    [workerId, workDate, ...DAILY_HOURS_EXCLUDED_PROCESS_CODES],
  );

  const countedHours = Number(approvedRows?.[0]?.counted_hours || 0)
    + Number(tempRows?.[0]?.counted_hours || 0);

  return {
    work_date: workDate,
    counted_hours: Number(countedHours.toFixed(4)),
    limit_hours: DAILY_HOURS_LIMIT,
    excluded_process_codes: DAILY_HOURS_EXCLUDED_PROCESS_CODES,
  };
}

module.exports = { getDailyHours };
