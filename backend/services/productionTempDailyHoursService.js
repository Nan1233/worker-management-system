'use strict';

const db = require('../config/db');
const { DAILY_HOURS_LIMIT } = require('../utils/dailyHoursLimit');

async function getDailyHours(workerId, workDate) {
  const [approvedRows] = await db.promise().query(
    "SELECT COALESCE(SUM(COALESCE(actual_time, 0)), 0) AS counted_hours FROM production_reports WHERE worker_id = ? AND work_date = ? AND status = 'approved'",
    [workerId, workDate],
  );
  const [tempRows] = await db.promise().query(
    "SELECT COALESCE(SUM(COALESCE(actual_time, 0)), 0) AS counted_hours FROM production_reports_temp WHERE worker_id = ? AND work_date = ? AND status IN ('pending', 'need_fix')",
    [workerId, workDate],
  );
  const countedHours = Number(approvedRows?.[0]?.counted_hours || 0) + Number(tempRows?.[0]?.counted_hours || 0);
  return { work_date: workDate, counted_hours: Number(countedHours.toFixed(4)), limit_hours: DAILY_HOURS_LIMIT };
}

module.exports = { getDailyHours };
