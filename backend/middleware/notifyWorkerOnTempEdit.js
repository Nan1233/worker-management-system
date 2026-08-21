const db = require("../config/db");
const AuditService = require("../services/auditService");

/**
 * Manager/admin sửa báo cáo chờ duyệt phải thông báo cho công nhân sở hữu báo cáo.
 * Lead không đi qua route PUT này nên không thể sửa.
 * Worker tự sửa báo cáo của mình thì không tạo thông báo cho chính mình.
 */
async function notifyWorkerOnTempEdit(req, res, next) {
    if (!req.user || !["admin", "manager"].includes(String(req.user.role || "").toLowerCase())) {
        return next();
    }

    const reportId = Number(req.params?.id);
    if (!Number.isInteger(reportId) || reportId <= 0) return next();

    let worker = null;
    try {
        const [rows] = await db.promise().query(
            `SELECT prt.id, prt.worker_id, prt.work_date, prt.shift, prt.product_name,
                    w.user_id AS worker_user_id
               FROM production_reports_temp prt
               JOIN workers w ON w.id = prt.worker_id
              WHERE prt.id = ?
              LIMIT 1`,
            [reportId],
        );
        worker = rows[0] || null;
    } catch (error) {
        console.warn(`[KTC] Could not prepare worker edit notification for temp report #${reportId}: ${error.message}`);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
        const response = originalJson(body);

        const changed = Boolean(body?.success && body?.data?.changed);
        const workerUserId = Number(worker?.worker_user_id || 0);
        if (changed && workerUserId > 0) {
            const workDate = String(worker?.work_date || "").slice(0, 10);
            void AuditService.notifyUsers([workerUserId], {
                type: "report_updated",
                title: "Báo cáo đã được cập nhật",
                message: `Báo cáo ngày ${workDate || "-"}, ca ${worker?.shift || "-"}, sản phẩm ${worker?.product_name || "-"} đã được quản lý cập nhật. Vui lòng kiểm tra lại báo cáo.`,
                linkUrl: `/worker/history/${reportId}?source=pending`,
                entityType: "temp_report",
                entityId: reportId,
            }).catch((error) => {
                console.warn(`[KTC] Worker edit notification failed for temp report #${reportId}: ${error.message}`);
            });
        }

        return response;
    };

    return next();
}

module.exports = notifyWorkerOnTempEdit;
