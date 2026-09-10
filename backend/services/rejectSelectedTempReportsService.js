const AuditService = require("./auditService");
const { query, getConnection, beginTransaction, commit, rollback, normalizeIds } = require("../models/productionTempModelShared");

async function rejectSelectedTempReports(ids, reviewerId, reason, isAdmin = false) {
    const reportIds = normalizeIds(ids);
    const cleanReason = String(reason || "").trim();
    if (!reportIds.length) { const e = new Error("Danh sách báo cáo không hợp lệ"); e.status = 400; e.code = "INVALID_REJECT_SELECTION"; throw e; }
    if (!Number.isInteger(Number(reviewerId)) || Number(reviewerId) <= 0) { const e = new Error("Thông tin người xử lý không hợp lệ"); e.status = 401; e.code = "INVALID_REVIEWER"; throw e; }
    if (!cleanReason) { const e = new Error("Vui lòng nhập lý do từ chối"); e.status = 400; e.code = "REJECT_REASON_REQUIRED"; throw e; }

    const connection = await getConnection();
    const activities = [];
    const notifications = [];
    try {
        await beginTransaction(connection);
        const placeholders = reportIds.map(() => "?").join(",");
        const scopeJoin = isAdmin ? "" : "JOIN manager_processes mp ON mp.process_id=temp.process_id";
        const scopeWhere = isAdmin ? "" : "AND mp.manager_id=?";
        const params = isAdmin ? [...reportIds] : [...reportIds, Number(reviewerId)];
        const rows = await query(connection, `
            SELECT DISTINCT temp.id,temp.worker_id,temp.process_id,temp.work_date,temp.shift,temp.product_name,w.user_id AS worker_user_id
            FROM production_reports_temp temp
            JOIN workers w ON w.id=temp.worker_id
            ${scopeJoin}
            WHERE temp.id IN (${placeholders})
              AND temp.status IN ('pending','need_fix')
              ${scopeWhere}
            ORDER BY temp.id ASC`, params);

        const eligibleIds = rows.map((row) => Number(row.id));
        const initiallySkipped = reportIds.filter((id) => !eligibleIds.includes(Number(id)));
        const rejectedRows = [];

        for (const row of rows) {
            const update = await query(connection, `
                UPDATE production_reports_temp
                   SET status='rejected', review_note=?, reviewed_by=?, updated_at=NOW()
                 WHERE id=? AND status IN ('pending','need_fix')`, [cleanReason, Number(reviewerId), Number(row.id)]);
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
            if (row.worker_user_id) notifications.push({ userIds: [Number(row.worker_user_id)], payload: { type: "report_rejected", title: "Báo cáo đã bị từ chối", message: `Báo cáo ngày ${String(row.work_date).slice(0,10)}, ca ${row.shift || "-"} bị từ chối: ${cleanReason}`, linkUrl: `/worker/history/${Number(row.id)}?source=temp`, entityType: "temp_report", entityId: Number(row.id) } });
        }

        if (activities.length) await AuditService.logActivities(activities, connection);
        await commit(connection);
        try { if (notifications.length) await AuditService.notifyBatch(notifications); } catch (e) { console.warn(`[KTC] Reject notification batch failed: ${e.message}`); }
        return { count: rejectedIds.length, rejected_ids: rejectedIds, skipped_ids: skippedIds, requested_ids: reportIds, initially_skipped_ids: initiallySkipped, reason: cleanReason };
    } catch (error) {
        await rollback(connection);
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { rejectSelectedTempReports };