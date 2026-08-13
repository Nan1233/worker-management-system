const AuditService = require("../services/auditService");
const { query, getConnection, beginTransaction, commit, rollback, normalizeIds, editableFields } = require("./productionTempModelShared");
const { createStandardResolver, assertStandardSnapshotConsistency } = require("../services/standardResolutionService");
const { assertKqdPolicySnapshotConsistency } = require("../services/kqdPolicySnapshotService");
const { assertApprovedEventForTempLine } = require("../services/machineProductionEventService");
const { createApprovedReportVersion } = require("../services/approvedVersionSnapshotService");
const { assertReviewBatchSize } = require("../services/managerReportPaginationService");

function workPeriod(value) {
    const text = value instanceof Date
        ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`
        : String(value || "").slice(0, 7);
    const match = /^(\d{4})-(\d{2})$/.exec(text);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]) };
}

async function loadLockedReportingPeriods(connection, rows) {
    const unique = new Map();
    for (const row of rows) {
        const period = workPeriod(row.work_date);
        const processId = Number(row.process_id);
        if (!period || !Number.isInteger(processId) || processId <= 0) continue;
        unique.set(`${period.year}-${period.month}-${processId}`, { ...period, processId });
    }
    const periods = [...unique.values()];
    if (!periods.length) return [];
    const clauses = periods.map(() => `(report_year=? AND report_month=? AND (process_id IS NULL OR process_id=?))`);
    const params = periods.flatMap((item) => [item.year, item.month, item.processId]);
    return query(connection, `SELECT report_year, report_month, process_id
        FROM reporting_period_locks
        WHERE status='locked' AND (${clauses.join(' OR ')})`, params);
}

function assertReportingPeriodUnlocked(item, lockedRows) {
    const period = workPeriod(item.work_date);
    if (!period) return;
    const processId = Number(item.process_id);
    const locked = lockedRows.some((row) => Number(row.report_year) === period.year
        && Number(row.report_month) === period.month
        && (row.process_id === null || Number(row.process_id) === processId));
    if (locked) throw new Error(`Kỳ báo cáo ${String(item.work_date).slice(0, 7)} đã khóa`);
}

function serializeExtraData(value) {
    if (value === null || value === undefined || value === "") return null;

    if (Buffer.isBuffer(value)) {
        value = value.toString("utf8");
    }

    if (typeof value === "string") {
        try {
            return JSON.stringify(JSON.parse(value));
        } catch {
            // Legacy/bad values must never be written into a JSON column as
            // "[object Object]" or another invalid JSON text. Keep the raw
            // value as a JSON string so approval can proceed without data loss.
            return JSON.stringify(value);
        }
    }

    return JSON.stringify(value);
}

module.exports = {
    async approveSelected(targets, reviewerId, isAdmin = false) {
        assertReviewBatchSize(targets);
        const normalizedTargets = Array.isArray(targets)
            ? targets.map((item) => typeof item === "object" ? item : { id: item, expected_updated_at: null })
            : [];
        const reportIds = normalizeIds(normalizedTargets.map((item) => item.id));
        const expectedById = new Map(normalizedTargets.map((item) => [Number(item.id), item.expected_updated_at || null]));
        if (reportIds.length === 0) throw new Error("Danh sách báo cáo không hợp lệ");

        const connection = await getConnection();
        const postCommitNotifications = [];
        try {
            await beginTransaction(connection);
            const placeholders = reportIds.map(() => "?").join(",");
            const scopeJoin = isAdmin ? "" : "JOIN manager_processes mp ON mp.process_id = temp.process_id";
            const scopeWhere = isAdmin ? "" : "AND mp.manager_id = ?";
            const rows = await query(
                connection,
                `SELECT DISTINCT temp.*, w.user_id AS worker_user_id
                 FROM production_reports_temp temp
                 JOIN workers w ON w.id = temp.worker_id
                 ${scopeJoin}
                 WHERE temp.id IN (${placeholders})
                   AND temp.status IN ('pending', 'need_fix')
                   ${scopeWhere}
                 FOR UPDATE`,
                isAdmin ? reportIds : [...reportIds, reviewerId]
            );

            if (rows.length !== reportIds.length) {
                throw new Error("Có báo cáo không tồn tại, đã xử lý hoặc ngoài phạm vi phụ trách");
            }
            for (const row of rows) {
                const expected = expectedById.get(Number(row.id));
                if (expected && new Date(expected).getTime() !== new Date(row.updated_at).getTime()) {
                    const error = new Error(`Báo cáo #${row.id} đã thay đổi sau khi bạn mở danh sách. Hãy tải lại trước khi duyệt.`);
                    error.status = 409;
                    error.code = "TEMP_REPORT_VERSION_CONFLICT";
                    throw error;
                }
            }

            const lockedReportingPeriods = await loadLockedReportingPeriods(connection, rows);

            const approvedIds = [];
            const dates = new Set();
            const standardResolver = createStandardResolver({ query: (sql, params = []) => query(connection, sql, params) });

            for (const item of rows) {
                assertReportingPeriodUnlocked(item, lockedReportingPeriods);

                const isMachineReport = String(item.operation_mode || '').toUpperCase() === 'MACHINE';
                if (isMachineReport) {
                    const tempLines = await this.getTempMachineLines(item.id, connection);
                    if (!tempLines.length) {
                        const error = new Error(`Báo cáo máy #${item.id} không có dòng máy để xác minh định mức`);
                        error.status = 422; error.code = 'STANDARD_SNAPSHOT_MISSING'; error.isPublic = true;
                        throw error;
                    }
                    for (const line of tempLines) {
                        await assertApprovedEventForTempLine(connection, { report: item, line });
                        const resolved = await standardResolver.resolveStandard({
                            processId: item.process_id, productCode: line.product_code, machineId: line.machine_id,
                            machineCode: line.machine_code, workDate: item.work_date
                        });
                        assertStandardSnapshotConsistency({
                            resolved, standardOutput: line.standard_output, standardVersionId: line.standard_version_id,
                            machineStandardId: line.machine_standard_id
                        });
                        assertKqdPolicySnapshotConsistency({ resolved, snapshot: line.exclude_kqd_from_tt });
                    }
                } else {
                    const resolved = await standardResolver.resolveStandard({
                        processId: item.process_id, productCode: item.product_name, workDate: item.work_date
                    });
                    assertStandardSnapshotConsistency({
                        resolved, standardOutput: item.standard_output, standardVersionId: item.standard_version_id,
                        machineStandardId: item.machine_standard_id
                    });
                    assertKqdPolicySnapshotConsistency({ resolved, snapshot: item.exclude_kqd_from_tt_snapshot });
                }

                const insertResult = await query(
                    connection,
                    `INSERT INTO production_reports
                     (source_temp_id, worker_id, process_id, work_date, entry_date, shift, operation_type, operation_mode, machine_no,
                      product_name, total_time, actual_time, deduction_time,
                      standard_output, standard_version_id, machine_standard_id, training_percent_snapshot, exclude_kqd_from_tt_snapshot, actual_output, tt_ok, tt_ng, note, extra_data,
                      status, review_note, reviewed_by, approved_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                             'approved', ?, ?, NOW())`,
                    [
                        item.id, item.worker_id, item.process_id, item.work_date,
                        item.entry_date || item.work_date, item.shift,
                        item.operation_type ?? null,
                        item.operation_mode ?? null,
                        item.machine_no, item.product_name,
                        item.total_time, item.actual_time, item.deduction_time,
                        item.standard_output, item.standard_version_id || null, item.machine_standard_id || null, item.training_percent_snapshot ?? null, item.exclude_kqd_from_tt_snapshot ?? null, item.actual_output, item.tt_ok,
                        item.tt_ng, item.note, serializeExtraData(item.extra_data), item.review_note, reviewerId
                    ]
                );

                const approvedReportId = insertResult.insertId;
                approvedIds.push(approvedReportId);
                const workDate = item.work_date instanceof Date
                    ? `${item.work_date.getFullYear()}-${String(item.work_date.getMonth() + 1).padStart(2, "0")}-${String(item.work_date.getDate()).padStart(2, "0")}`
                    : String(item.work_date).slice(0, 10);
                dates.add(workDate);

                await query(
                    connection,
                    `INSERT INTO production_report_defects (report_id, defect_type_id, quantity)
                     SELECT ?, defect_type_id, quantity
                     FROM production_temp_defects
                     WHERE temp_report_id = ?`,
                    [approvedReportId, item.id]
                );

                await query(
                    connection,
                    `INSERT INTO production_report_deductions (report_id, deduction_type_id, hours)
                     SELECT ?, deduction_type_id, hours
                     FROM production_temp_deductions
                     WHERE temp_report_id = ?`,
                    [approvedReportId, item.id]
                );

                await this.copyMachineLinesToApproved(item.id, approvedReportId, connection);

                const [snapshotDefects, snapshotDeductions] = await Promise.all([
                    query(connection, `SELECT dt.defect_code, dt.defect_name, d.quantity
                        FROM production_report_defects d LEFT JOIN defect_types dt ON dt.id=d.defect_type_id
                        WHERE d.report_id=? ORDER BY d.id`, [approvedReportId]),
                    query(connection, `SELECT dt.deduction_code, dt.deduction_name, d.hours
                        FROM production_report_deductions d LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id
                        WHERE d.report_id=? ORDER BY d.id`, [approvedReportId])
                ]);
                const snapshotData = JSON.stringify({
                    report: {
                        id: approvedReportId, source_temp_id: item.id, worker_id: item.worker_id,
                        process_id: item.process_id, work_date: item.work_date, shift: item.shift,
                        operation_type: item.operation_type ?? null,
                        operation_mode: item.operation_mode ?? null,
                        machine_no: item.machine_no, product_code: item.product_name,
                        total_time: Number(item.total_time || 0), actual_time: Number(item.actual_time || 0),
                        deduction_time: Number(item.deduction_time || 0), standard_output: Number(item.standard_output || 0),
                        actual_output: Number(item.actual_output || 0), tt_ok: Number(item.tt_ok || 0),
                        tt_ng: Number(item.tt_ng || 0), exclude_kqd_from_tt: Number(item.exclude_kqd_from_tt || 0),
                        standard_version_id: item.standard_version_id || null, machine_standard_id: item.machine_standard_id || null,
                        training_percent_snapshot: item.training_percent_snapshot ?? null,
                        exclude_kqd_from_tt_snapshot: item.exclude_kqd_from_tt_snapshot ?? null
                    },
                    defects: snapshotDefects,
                    deductions: snapshotDeductions
                });
                await query(connection, `INSERT INTO production_report_snapshots
                    (report_id,snapshot_type,standard_version_id,calculation_version,snapshot_data,created_by)
                    VALUES(?,'approved',?,'v1',?,?)
                    ON DUPLICATE KEY UPDATE snapshot_data=VALUES(snapshot_data),standard_version_id=VALUES(standard_version_id),created_by=VALUES(created_by),created_at=CURRENT_TIMESTAMP`,
                    [approvedReportId, item.standard_version_id || null, snapshotData, reviewerId]);

                // Approved V1 luôn dùng canonical aggregate snapshot schema v2.
                await createApprovedReportVersion(
                    {
                        reportId: approvedReportId,
                        reason: `Tạo từ báo cáo tạm #${item.id}`,
                        userId: reviewerId
                    },
                    connection
                );

                await this.logAction(
                    {
                        reportType: "temp",
                        reportId: item.id,
                        userId: reviewerId,
                        action: "APPROVE",
                        note: `Đã chuyển thành báo cáo chính thức #${approvedReportId}`
                    },
                    connection
                );

                await this.logAction(
                    {
                        reportType: "approved",
                        reportId: approvedReportId,
                        userId: reviewerId,
                        action: "CREATE",
                        note: `Tạo từ báo cáo tạm #${item.id}`
                    },
                    connection
                );

                await AuditService.logActivity(
                    {
                        userId: reviewerId,
                        action: "REPORT_APPROVED",
                        entityType: "approved_report",
                        entityId: approvedReportId,
                        description: `Duyệt báo cáo tạm #${item.id} thành báo cáo chính thức #${approvedReportId}`,
                        metadata: {
                            temp_report_id: item.id,
                            approved_report_id: approvedReportId,
                            worker_id: item.worker_id,
                            process_id: item.process_id,
                            work_date: item.work_date,
                            shift: item.shift
                        }
                    },
                    connection
                );

                await query(
                    connection,
                    `UPDATE production_reports_temp
                     SET status = 'approved', reviewed_by = ?, approved_at = NOW(), updated_at = NOW()
                     WHERE id = ?`,
                    [reviewerId, item.id]
                );

                const approvedTempSnapshot = await AuditService.loadTempReportSnapshot(item.id, connection);
                if (approvedTempSnapshot) {
                    await AuditService.createReportVersion({
                        reportType: "temp",
                        reportId: item.id,
                        snapshot: approvedTempSnapshot,
                        reason: `Được duyệt thành báo cáo chính thức #${approvedReportId}`,
                        userId: reviewerId
                    }, connection);
                }

                postCommitNotifications.push({
                    userIds: [item.worker_user_id],
                    payload: {
                        type: "report_approved",
                        title: "Báo cáo đã được duyệt",
                        message: `Báo cáo ngày ${workDate}, ca ${item.shift || "-"}, sản phẩm ${item.product_name || "-"} đã được duyệt.`,
                        linkUrl: `/worker/history/${approvedReportId}?source=approved`,
                        entityType: "approved_report",
                        entityId: approvedReportId
                    }
                });
            }

            await commit(connection);
            for (const notification of postCommitNotifications) {
                try {
                    await AuditService.notifyUsers(notification.userIds, notification.payload);
                } catch (error) {
                    console.warn(`[KTC] Post-commit approval notification failed: ${error.message}`);
                }
            }
            return {
                count: rows.length,
                temp_ids: rows.map((row) => row.id),
                approved_ids: approvedIds,
                dates: [...dates]
            };
        } catch (error) {
            await rollback(connection);
            throw error;
        } finally {
            connection.release();
        }
    },

    async rejectSelected(targets, reviewerId, reason, isAdmin = false) {
        assertReviewBatchSize(targets);
        const normalizedTargets = Array.isArray(targets)
            ? targets.map((item) => typeof item === "object" ? item : { id: item, expected_updated_at: null })
            : [];
        const reportIds = normalizeIds(normalizedTargets.map((item) => item.id));
        const expectedById = new Map(normalizedTargets.map((item) => [Number(item.id), item.expected_updated_at || null]));
        const cleanReason = String(reason || "").trim();
        if (reportIds.length === 0) throw new Error("Danh sách báo cáo không hợp lệ");
        if (!cleanReason) throw new Error("Vui lòng nhập lý do từ chối");

        const connection = await getConnection();
        const postCommitNotifications = [];
        try {
            await beginTransaction(connection);
            const placeholders = reportIds.map(() => "?").join(",");
            const scopeJoin = isAdmin ? "" : "JOIN manager_processes mp ON mp.process_id = temp.process_id";
            const scopeWhere = isAdmin ? "" : "AND mp.manager_id = ?";
            const rows = await query(
                connection,
                `SELECT DISTINCT temp.id, temp.worker_id, temp.process_id, temp.work_date, temp.shift, temp.updated_at,
                        w.user_id AS worker_user_id
                 FROM production_reports_temp temp
                 JOIN workers w ON w.id = temp.worker_id
                 ${scopeJoin}
                 WHERE temp.id IN (${placeholders})
                   AND temp.status IN ('pending', 'need_fix')
                   ${scopeWhere}
                 FOR UPDATE`,
                isAdmin ? reportIds : [...reportIds, reviewerId]
            );

            if (rows.length !== reportIds.length) {
                throw new Error("Có báo cáo không tồn tại, đã xử lý hoặc ngoài phạm vi phụ trách");
            }
            for (const row of rows) {
                const expected = expectedById.get(Number(row.id));
                if (expected && new Date(expected).getTime() !== new Date(row.updated_at).getTime()) {
                    const error = new Error(`Báo cáo #${row.id} đã thay đổi sau khi bạn mở danh sách. Hãy tải lại trước khi từ chối.`);
                    error.status = 409;
                    error.code = "TEMP_REPORT_VERSION_CONFLICT";
                    throw error;
                }
            }

            for (const row of rows) {
                await query(
                    connection,
                    `UPDATE production_reports_temp
                     SET status = 'rejected', review_note = ?, reviewed_by = ?, updated_at = NOW()
                     WHERE id = ?`,
                    [cleanReason, reviewerId, row.id]
                );

                const rejectedSnapshot = await AuditService.loadTempReportSnapshot(row.id, connection);
                if (rejectedSnapshot) {
                    await AuditService.createReportVersion({
                        reportType: "temp",
                        reportId: row.id,
                        snapshot: rejectedSnapshot,
                        reason: `Bị từ chối: ${cleanReason}`,
                        userId: reviewerId
                    }, connection);
                }

                await this.logAction(
                    {
                        reportType: "temp",
                        reportId: row.id,
                        userId: reviewerId,
                        action: "REJECT",
                        note: cleanReason
                    },
                    connection
                );

                await AuditService.logActivity(
                    {
                        userId: reviewerId,
                        action: "REPORT_REJECTED",
                        entityType: "temp_report",
                        entityId: row.id,
                        description: `Từ chối báo cáo #${row.id}: ${cleanReason}`,
                        metadata: { reason: cleanReason, worker_id: row.worker_id, process_id: row.process_id }
                    },
                    connection
                );

                postCommitNotifications.push({
                    userIds: [row.worker_user_id],
                    payload: {
                        type: "report_rejected",
                        title: "Báo cáo đã bị từ chối",
                        message: `Báo cáo ngày ${String(row.work_date).slice(0, 10)} ca ${row.shift || "-"} bị từ chối: ${cleanReason}`,
                        linkUrl: `/worker/history/${row.id}?source=pending`,
                        entityType: "temp_report",
                        entityId: row.id
                    }
                });
            }

            await commit(connection);
            for (const notification of postCommitNotifications) {
                try {
                    await AuditService.notifyUsers(notification.userIds, notification.payload);
                } catch (error) {
                    console.warn(`[KTC] Post-commit rejection notification failed: ${error.message}`);
                }
            }
            return { count: rows.length, ids: rows.map((row) => row.id) };
        } catch (error) {
            await rollback(connection);
            throw error;
        } finally {
            connection.release();
        }
    }
};
