const db = require("../config/db");
const AuditService = require("./auditService");
const ProductionTemp = require("../models/productionTempModel");
const { requestMeta } = require("../controllers/productionTempControllerUtils");

function queuePostCreateSideEffects({ req, result, workerId, processId, data }) {
    if (result.duplicate) return;

    const userId = req.user?.id;
    const meta = requestMeta(req);

    setImmediate(async () => {
        try {
            await ProductionTemp.logAction({
                reportType: "temp",
                reportId: result.id,
                userId,
                action: "CREATE",
                note: "Công nhân tạo báo cáo",
                ...meta,
            });
        } catch (error) {
            console.error("CREATE REPORT ACTION LOG ERROR:", error);
        }

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

            try {
                await AuditService.logActivity({
                    userId,
                    action: "CREATE_REPORT",
                    entityType: "temp_report",
                    entityId: result.id,
                    description:
                        `${worker.worker_code} - ${worker.full_name} tạo báo cáo `
                        + `công đoạn ${process.process_name}, ca ${data.shift}, `
                        + `máy ${data.machine_no || "---"}, sản phẩm ${data.product_name || "---"}`,
                    metadata: {
                        report_id: result.id,
                        worker_id: workerId,
                        worker_code: worker.worker_code,
                        worker_name: worker.full_name,
                        process_id: processId,
                        process_name: process.process_name,
                        work_date: data.work_date,
                        shift: data.shift,
                        machine_no: data.machine_no,
                        product_name: data.product_name,
                        tt_ok: data.tt_ok,
                        tt_ng: data.tt_ng,
                    },
                    req: {
                        ip: meta.ipAddress,
                        headers: { "user-agent": meta.userAgent },
                    },
                });
            } catch (error) {
                console.error("CREATE REPORT ACTIVITY LOG ERROR:", error);
            }

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
