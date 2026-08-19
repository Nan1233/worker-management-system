const db = require("../config/db");
const { query } = require("./productionTempModelShared");

module.exports = {
    async getActionLogs(reportId, reportType = "temp") {
        return query(
            db,
            `SELECT l.*, u.username, u.full_name, u.role
             FROM report_action_logs l
             JOIN users u ON u.id = l.user_id
             WHERE l.report_type = ? AND l.report_id = ?
             ORDER BY l.created_at DESC, l.id DESC`,
            [reportType, reportId]
        );
    },

    async getHistoryByWorker(workerId) {
        return query(
            db,
            `SELECT * FROM (
                SELECT pr.id, 'approved' AS source, pr.worker_id, pr.process_id,
                       pr.work_date, pr.shift, pr.operation_type, pr.operation_mode, pr.machine_no, pr.product_name,
                       pr.standard_output, pr.actual_output, pr.total_time,
                       pr.actual_time, pr.deduction_time, pr.tt_ok, pr.tt_ng,
                       pr.status, pr.review_note, pr.created_at, pr.approved_at,
                       p.process_name
                FROM production_reports pr
                LEFT JOIN processes p ON pr.process_id = p.id
                WHERE pr.worker_id = ?

                UNION ALL

                SELECT temp.id, 'temp' AS source, temp.worker_id, temp.process_id,
                       temp.work_date, temp.shift, temp.operation_type, temp.operation_mode, temp.machine_no, temp.product_name,
                       temp.standard_output, temp.actual_output, temp.total_time,
                       temp.actual_time, temp.deduction_time, temp.tt_ok, temp.tt_ng,
                       temp.status, temp.review_note, temp.created_at, temp.approved_at,
                       p.process_name
                FROM production_reports_temp temp
                LEFT JOIN processes p ON temp.process_id = p.id
                WHERE temp.worker_id = ? AND temp.status <> 'approved'
             ) history
             ORDER BY created_at DESC`,
            [workerId, workerId]
        );
    }
};
