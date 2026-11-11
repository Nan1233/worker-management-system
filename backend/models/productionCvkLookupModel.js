'use strict';

// CVK uses process 30002; retain 60006 for historical reports.
// Pending/need_fix reports are preferred to approved reports.
// Load the database adapter only when using the production query path.
// Tests can inject an isolated query function without loading TiDB config.
function defaultQuery(sql, params) {
  const db = require('../config/db');
  return db.promise().query(sql, params);
}

async function findExistingCvkReport({ workerId, workDate, shift, workType }, query = defaultQuery) {
  if (!Number.isInteger(workerId) || workerId <= 0
      || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !shift || !workType) {
    return null;
  }

  const params = [workerId, workDate, shift, workType];
  const [tempRows] = await query(
    `SELECT id, status, work_date, shift, actual_time, deduction_time, total_time,
            'temp' AS report_type
       FROM production_reports_temp
      WHERE worker_id=? AND process_id IN (30002, 60006) AND work_date=? AND shift=?
        AND UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.work_type')), ''))=UPPER(?)
        AND status IN ('pending','need_fix')
      ORDER BY id DESC LIMIT 1`,
    params
  );
  if (tempRows?.[0]) return tempRows[0];

  const [approvedRows] = await query(
    `SELECT id, status, work_date, shift, actual_time, deduction_time, total_time,
            'approved' AS report_type
       FROM production_reports
      WHERE worker_id=? AND process_id IN (30002, 60006) AND work_date=? AND shift=?
        AND UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.work_type')), ''))=UPPER(?)
        AND status <> 'deleted'
      ORDER BY id DESC LIMIT 1`,
    params
  );
  return approvedRows?.[0] || null;
}

module.exports = { findExistingCvkReport };
