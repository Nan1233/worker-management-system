const db = require("../config/db");
const AuditService = require("../services/auditService");

const WORKER_SELF_EDIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Manager/admin sửa báo cáo chờ duyệt phải thông báo cho công nhân sở hữu báo cáo.
 * Worker tự sửa báo cáo của mình chỉ được phép trong 10 phút kể từ lúc nộp.
 */
async function notifyWorkerOnTempEdit(req, res, next) {
    const role = String(req.user?.role || "").toLowerCase();
    const reportId = Number(req.params?.id);
    if (!Number.isInteger(reportId) || reportId <= 0) return next();

    let report = null;
    try {
        const [rows] = await db.promise().query(
            `SELECT prt.id, prt.worker_id, prt.work_date, prt.shift, prt.product_name,
                    prt.status, prt.created_at, prt.updated_at,
                    w.user_id AS worker_user_id
               FROM production_reports_temp prt
               JOIN workers w ON w.id = prt.worker_id
              WHERE prt.id = ?
              LIMIT 1`,
            [reportId],
        );
        report = rows[0] || null;
    } catch (error) {
        console.warn(`[KTC] Could not load temp report edit policy for #${reportId}: ${error.message}`);
        if (role === "worker") {
            return res.status(503).json({
                success: false,
                code: "WORKER_EDIT_WINDOW_CHECK_FAILED",
                message: "Không thể kiểm tra thời gian sửa báo cáo. Vui lòng thử lại."
            });
        }
        return next();
    }

    if (!report) {
        if (role === "worker") {
            return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });
        }
        return next();
    }

    if (role === "worker") {
        if (Number(report.worker_user_id) !== Number(req.user?.id)) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền sửa báo cáo này" });
        }

        if (String(report.status || "").toLowerCase() === "approved") {
            return res.status(422).json({ success: false, message: "Báo cáo đã duyệt không thể sửa" });
        }

        const createdAt = new Date(report.created_at).getTime();
        const elapsed = Date.now() - createdAt;
        if (!Number.isFinite(createdAt) || elapsed < 0 || elapsed > WORKER_SELF_EDIT_WINDOW_MS) {
            return res.status(422).json({
                success: false,
                code: "WORKER_EDIT_WINDOW_EXPIRED",
                message: "Đã hết 10 phút chỉnh sửa báo cáo. Vui lòng liên hệ quản lý nếu cần sửa."
            });
        }

        return next();
    }

    if (!["admin", "manager"].includes(role)) return next();

    const originalJson = res.json.bind(res);
    res.json = (body) => {
        const response = originalJson(body);
        const changed = Boolean(body?.success && body?.data?.changed);
        const workerUserId = Number(report.worker_user_id || 0);
        if (changed && workerUserId > 0) {
            const workDate = String(report.work_date || "").slice(0, 10);
            void AuditService.notifyUsers([workerUserId], {
                type: "report_updated",
                title: "Báo cáo đã được cập nhật",
                message: `Báo cáo ngày ${workDate || "-"}, ca ${report.shift || "-"}, sản phẩm ${report.product_name || "-"} đã được quản lý cập nhật. Vui lòng kiểm tra lại báo cáo.`,
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
