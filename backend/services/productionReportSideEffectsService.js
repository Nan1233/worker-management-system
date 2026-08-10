const db = require("../config/db");
const AuditService = require("./auditService");

function queuePostCreateSideEffects({ result, workerId, processId, data }) {
    if (result.duplicate) return;

    setImmediate(async () => {
        let worker = { worker_code: "---", full_name: "---" };
        let process = { process_name: "---" };

        try {
            const [[workerRows], [processRows], [reviewers]] = await Promise.all([
                db.promise().query(
                    `SELECT w.worker_code, u.full_name
                     FROM workers w
                     INNER JOIN users u ON u.id = w.user_id
                     WHERE w.id = ? LIMIT 1`,
                    [workerId],
                ),
                db.promise().query(
                    `SELECT process_name FROM processes WHERE id = ? LIMIT 1`,
                    [processId],
                ),
                db.promise().query(
                    `SELECT DISTINCT u.id, u.role
                     FROM users u
                     LEFT JOIN manager_processes mp ON mp.manager_id = u.id
                     WHERE u.status = 'active'
                       AND (
                            u.role = 'admin'
                            OR (u.role IN ('manager', 'lead') AND mp.process_id = ?)
                       )`,
                    [processId],
                ),
            ]);

            if (workerRows.length) worker = workerRows[0];
            if (processRows.length) process = processRows[0];

            const groups = { lead: [], manager: [], admin: [] };
            reviewers.forEach((reviewer) => {
                if (groups[reviewer.role]) groups[reviewer.role].push(reviewer.id);
            });

            const notification = {
                type: "info",
                title: "Có báo cáo mới chờ duyệt",
                message:
                    `${worker.worker_code} - ${worker.full_name} vừa gửi báo cáo `
                    + `công đoạn ${process.process_name}, ca ${data.shift}, `
                    + `sản phẩm ${data.product_name || "---"}.`,
                entityType: "temp_report",
                entityId: result.id,
            };

            await Promise.all([
                AuditService.notifyUsers(groups.lead, {
                    ...notification,
                    linkUrl: `/lead/reports?date=${data.work_date}`,
                }),
                AuditService.notifyUsers(groups.manager, {
                    ...notification,
                    linkUrl: `/manager/reports?date=${data.work_date}`,
                }),
                AuditService.notifyUsers(groups.admin, {
                    ...notification,
                    linkUrl: `/manager/reports?date=${data.work_date}`,
                }),
            ]);
        } catch (error) {
            console.error("CREATE REPORT BACKGROUND TASK ERROR:", error);
        }
    });
}

module.exports = { queuePostCreateSideEffects };
