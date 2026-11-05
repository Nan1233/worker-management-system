"use strict";
// Single source of truth for "hours already counted toward the 12-hour daily cap".
//
// Counted hours per report:
//   * GC report with machine lines -> MAX over its lines of (machine_time_hours - deduction_time_hours),
//     never the parent actual_time (GC machine parents store actual_time = 0 by design).
//   * every other report           -> parent actual_time.
// Split GC submissions share extra_data.gc_group_request_id; the group is counted once (MAX), so the
// same worker time is not added once per machine child. Approved (not deleted) and pending/need_fix
// temporary reports count; rejected reports do not.
//
// Used by the read endpoint (/api/production-temp/daily-hours) and by every write guard
// (submission pre-check, locked create, temp edit) so the form and the guard can never disagree.

const buildDailyCountedHoursSql = ({ excludeTempReport = false } = {}) => `SELECT COALESCE(SUM(group_hours),0) AS counted_hours FROM (
            SELECT group_key, MAX(counted_hours) AS group_hours FROM (
                SELECT CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(pr.extra_data, '$.gc_group_request_id')) IS NOT NULL
                    THEN CONCAT('GC_GROUP:', JSON_UNQUOTE(JSON_EXTRACT(pr.extra_data, '$.gc_group_request_id')))
                    ELSE CONCAT('APPROVED:', pr.id) END AS group_key,
                    CASE WHEN p.process_code='GC' AND EXISTS (SELECT 1 FROM production_report_machine_lines ml WHERE ml.report_id=pr.id)
                        THEN COALESCE((SELECT MAX(GREATEST(0, ml.machine_time_hours - ml.deduction_time_hours)) FROM production_report_machine_lines ml WHERE ml.report_id=pr.id),0)
                        ELSE COALESCE(pr.actual_time,0) END AS counted_hours
                FROM production_reports pr JOIN processes p ON p.id=pr.process_id
                WHERE pr.worker_id=? AND pr.work_date=? AND pr.status <> 'deleted'
                UNION ALL
                SELECT CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(pr.extra_data, '$.gc_group_request_id')) IS NOT NULL
                    THEN CONCAT('GC_GROUP:', JSON_UNQUOTE(JSON_EXTRACT(pr.extra_data, '$.gc_group_request_id')))
                    ELSE CONCAT('TEMP:', pr.id) END AS group_key,
                    CASE WHEN p.process_code='GC' AND EXISTS (SELECT 1 FROM production_temp_machine_lines ml WHERE ml.temp_report_id=pr.id)
                        THEN COALESCE((SELECT MAX(GREATEST(0, ml.machine_time_hours - ml.deduction_time_hours)) FROM production_temp_machine_lines ml WHERE ml.temp_report_id=pr.id),0)
                        ELSE COALESCE(pr.actual_time,0) END AS counted_hours
                FROM production_reports_temp pr JOIN processes p ON p.id=pr.process_id
                WHERE pr.worker_id=? AND pr.work_date=?${excludeTempReport ? " AND pr.id <> ?" : ""} AND pr.status IN ('pending','need_fix')
            ) daily_rows GROUP BY group_key
        ) daily_groups`;

const isValidWorkDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

/**
 * @param {(sql: string, params: unknown[]) => Promise<Array<{counted_hours: unknown}>>} runQuery
 * @returns {Promise<number|null>} counted hours, or null for an invalid worker/date
 */
async function queryCountedDailyHours(runQuery, { workerId, workDate, excludeTempReportId = null } = {}) {
    const worker = Number(workerId);
    const date = String(workDate || "").slice(0, 10);
    if (!Number.isInteger(worker) || worker <= 0 || !isValidWorkDate(date)) return null;
    const exclude = Number(excludeTempReportId);
    const excludeTempReport = Number.isInteger(exclude) && exclude > 0;
    const params = excludeTempReport ? [worker, date, worker, date, exclude] : [worker, date, worker, date];
    const rows = await runQuery(buildDailyCountedHoursSql({ excludeTempReport }), params);
    return Number(rows?.[0]?.counted_hours || 0);
}

module.exports = { buildDailyCountedHoursSql, queryCountedDailyHours, isValidWorkDate };
