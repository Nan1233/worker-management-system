const db = require("../config/db");

const findExistingCvkReport = async ({ workerId, workDate, shift, workType }) => {
    const params = [workerId, workDate, shift, workType];
    const [tempRows] = await db.promise().query(
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

    const [approvedRows] = await db.promise().query(
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
};

const getProcessCodeById = async (processId) => {
    const [rows] = await db.promise().query(
        "SELECT process_code FROM processes WHERE id = ? LIMIT 1",
        [processId]
    );
    return rows?.[0]?.process_code || null;
};

module.exports = {
    findExistingCvkReport,
    getProcessCodeById
};
