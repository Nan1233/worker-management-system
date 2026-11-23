const { toDateKey } = require("../utils/dateKey");
const { publicError } = require("../utils/httpError");
const AuditService = require("./auditService");
const { getConnection, beginTransaction, commit, rollback, normalizeIds } = require("../models/productionTempModelShared");
const { findRejectableReports, markReportRejected } = require("../repositories/productionTempRejectionRepository");

async function rejectSelectedTempReports(ids, reviewerId, reason, isAdmin = false) {
    const reportIds = normalizeIds(ids);
    const cleanReason = String(reason || "").trim();
    if (!reportIds.length) throw publicError("Danh sách báo cáo không hợp lệ", 400, "INVALID_REJECT_SELECTION");
    if (!Number.isInteger(Number(reviewerId)) || Number(reviewerId) <= 0) throw publicError("Thông tin người xử lý không hợp lệ", 401, "INVALID_REVIEWER");
    if (!cleanReason) throw publicError("Vui lòng nhập lý do từ chối", 400, "REJECT_REASON_REQUIRED");

    const connection = await getConnection();
    const activities = [];
    const notifications = [];
    let transactionCommitted = false;
    try {
        await beginTransaction(connection);
        const rows = await findRejectableReports(connection, reportIds, reviewerId, isAdmin);

        const eligibleIds = rows.map((row) => Number(row.id));
        const initiallySkipped = reportIds.filter((id) => !eligibleIds.includes(Number(id)));
        const rejectedRows = [];

        for (const row of rows) {
            const update = await markReportRejected(connection, row, reviewerId, cleanReason);
            if (Number(update?.affectedRows || 0) !== 1) continue;
            rejectedRows.push(row);
        }

        const rejectedIds = rejectedRows.map((row) => Number(row.id));
        const rejectedSet = new Set(rejectedIds);
        const skippedIds = reportIds.filter((id) => !rejectedSet.has(Number(id)));

        for (const row of rejectedRows) {
            activities.push({
                userId: Number(reviewerId), action: "REPORT_REJECTED", entityType: "temp_report", entityId: Number(row.id),
                description: `Từ chối báo cáo #${row.id}: ${cleanReason}`,
                metadata: { worker_id: Number(row.worker_id), process_id: Number(row.process_id), work_date: row.work_date, shift: row.shift, reason: cleanReason }
            });
            if (row.worker_user_id) notifications.push({ userIds: [Number(row.worker_user_id)], payload: { type: "report_rejected", title: "Báo cáo đã bị từ chối", message: `Báo cáo ngày ${toDateKey(row.work_date)}, ca ${row.shift || "-"} bị từ chối: ${cleanReason}`, linkUrl: `/worker/history/${Number(row.id)}?source=temp`, entityType: "temp_report", entityId: Number(row.id) } });
        }

        if (activities.length) await AuditService.logActivities(activities, connection);
        await commit(connection);
        transactionCommitted = true;
        try { if (notifications.length) await AuditService.notifyBatch(notifications); } catch (e) { console.warn(`[KTC] Reject notification batch failed: ${e.message}`); }
        return { count: rejectedIds.length, rejected_ids: rejectedIds, skipped_ids: skippedIds, requested_ids: reportIds, initially_skipped_ids: initiallySkipped, reason: cleanReason };
    } catch (error) {
        if (!transactionCommitted) {
            // Preserve the rejection failure even when TiDB cannot roll back.
            try {
                const result = await rollback(connection);
                if (result?.ok === false) {
                    if (error && typeof error === "object") error.rollbackError = result.error;
                    console.error("[KTC][REJECTION_ROLLBACK_FAILED]", result.error?.message || result.error);
                }
            } catch (rollbackError) {
                if (error && typeof error === "object") error.rollbackError = rollbackError;
                console.error("[KTC][REJECTION_ROLLBACK_FAILED]", rollbackError?.message || rollbackError);
            }
        }
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { rejectSelectedTempReports };