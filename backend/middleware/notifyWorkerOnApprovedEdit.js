const db = require("../config/db");
const AuditService = require("../services/auditService");

/** Notify the worker when a manager/admin edits an approved report. */
async function notifyWorkerOnApprovedEdit(req, res, next) {
    if (!req.user || !["admin", "manager"].includes(String(req.user.role || "").toLowerCase())) {
        return next();
    }

    const reportId = Number(req.params?.id);
    if (!Number.isInteger(reportId) || reportId <= 0) return next();

    let report = null;
    try {
        const [rows] = await db.promise().query(
            `SELECT pr.id, pr.worker_id, pr.work_date, pr.shift, pr.product_name,
                    w.user_id AS worker_user_id
               FROM production_reports pr
               JOIN workers w ON w.id = pr.worker_id
              WHERE pr.id = ?
              LIMIT 1`,
            [reportId],
        );
        report = rows[0] || null;
    } catch (error) {
        console.warn(`[KTC] Could not prepare worker approved-edit notification for report #${reportId}: ${error.message}`);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
        const response = originalJson(body);
        const changed = Boolean(body?.success && (body?.data?.changed || body?.data?.updated));
        const workerUserId = Number(report?.worker_user_id || 0);

        if (changed && workerUserId > 0) {
            const workDate = String(report?.work_date || "").slice(0, 10);
            void AuditService.notifyUsers([workerUserId], {
                type: "report_updated",
                title: "Báo cáo đã được cập nhật",
                message: `Báo cáo ngày ${workDate || "-"}, ca ${report?.shift || "-"}, sản phẩm ${report?.product_name || "-"} đã được quản lý cập nhật sau khi duyệt. Vui lòng kiểm tra lại.`,
                linkUrl: `/worker/history/${reportId}?source=approved`,
                entityType: "approved_report",
                entityId: reportId,
            }).catch((error) => {
                console.warn(`[KTC] Worker approved-edit notification failed for report #${reportId}: ${error.message}`);
            });
        }

        return response;
    };

    return next();
}

module.exports = notifyWorkerOnApprovedEdit;
