const AuditService = require("../services/auditService");
const { query, getConnection, beginTransaction, commit, rollback, normalizeIds, editableFields } = require("./productionTempModelShared");

module.exports = {
    async approveSelected(ids, reviewerId, isAdmin = false) {
        const reportIds = normalizeIds(ids);
        if (reportIds.length === 0) throw new Error("Danh sách báo cáo không hợp lệ");

        const connection = await getConnection();
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

            const approvedIds = [];
            const dates = new Set();

            for (const item of rows) {
                const lockRows = await query(
                    connection,
                    `SELECT id FROM reporting_period_locks
                     WHERE report_year = YEAR(?) AND report_month = MONTH(?)
                       AND status = 'locked'
                       AND (process_id IS NULL OR process_id = ?)
                     LIMIT 1`,
                    [item.work_date, item.work_date, item.process_id]
                );
                if (lockRows.length) {
                    throw new Error(`Kỳ báo cáo ${String(item.work_date).slice(0, 7)} đã khóa`);
                }

                const insertResult = await query(
                    connection,
                    `INSERT INTO production_reports
                     (source_temp_id, worker_id, process_id, work_date, entry_date, shift, operation_type, operation_mode, machine_no,
                      product_name, total_time, actual_time, deduction_time,
                      standard_output, actual_output, tt_ok, tt_ng, note, extra_data,
                      status, review_note, reviewed_by, approved_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                             'approved', ?, ?, NOW())`,
                    [
                        item.id, item.worker_id, item.process_id, item.work_date,
                        item.entry_date || item.work_date, item.shift,
                        item.operation_type ?? null,
                        item.operation_mode ?? null,
                        item.machine_no, item.product_name,
                        item.total_time, item.actual_time, item.deduction_time,
                        item.standard_output, item.actual_output, item.tt_ok,
                        item.tt_ng, item.note, item.extra_data || null, item.review_note, reviewerId
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

                const [snapshotDefects, snapshotDeductions, standardVersions] = await Promise.all([
                    query(connection, `SELECT dt.defect_code, dt.defect_name, d.quantity
                        FROM production_report_defects d LEFT JOIN defect_types dt ON dt.id=d.defect_type_id
                        WHERE d.report_id=? ORDER BY d.id`, [approvedReportId]),
                    query(connection, `SELECT dt.deduction_code, dt.deduction_name, d.hours
                        FROM production_report_deductions d LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id
                        WHERE d.report_id=? ORDER BY d.id`, [approvedReportId]),
                    query(connection, `SELECT id, exclude_kqd_from_tt FROM product_standard_versions
                        WHERE process_id=? AND product_code=? AND status='active'
                          AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
                        ORDER BY effective_from DESC, version_no DESC LIMIT 1`,
                        [item.process_id, item.product_name, item.work_date, item.work_date])
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
                        tt_ng: Number(item.tt_ng || 0), exclude_kqd_from_tt: Number(standardVersions[0]?.exclude_kqd_from_tt || 0)
                    },
                    defects: snapshotDefects,
                    deductions: snapshotDeductions
                });
                await query(connection, `INSERT INTO production_report_snapshots
                    (report_id,snapshot_type,standard_version_id,calculation_version,snapshot_data,created_by)
                    VALUES(?,'approved',?,'v1',?,?)
                    ON DUPLICATE KEY UPDATE snapshot_data=VALUES(snapshot_data),standard_version_id=VALUES(standard_version_id),created_by=VALUES(created_by),created_at=CURRENT_TIMESTAMP`,
                    [approvedReportId, standardVersions[0]?.id || null, snapshotData, reviewerId]);

                // Phiên bản V1 dùng để xem/so sánh/khôi phục về sau.
                const [versionReports, versionDefects, versionDeductions] = await Promise.all([
                    query(connection, `SELECT * FROM production_reports WHERE id=? LIMIT 1`, [approvedReportId]),
                    query(connection, `SELECT * FROM production_report_defects WHERE report_id=? ORDER BY id`, [approvedReportId]),
                    query(connection, `SELECT * FROM production_report_deductions WHERE report_id=? ORDER BY id`, [approvedReportId])
                ]);
                if (versionReports[0]) {
                    await AuditService.createReportVersion(
                        {
                            reportType: 'approved',
                            reportId: approvedReportId,
                            snapshot: { ...versionReports[0], defects: versionDefects, deductions: versionDeductions },
                            reason: `Tạo từ báo cáo tạm #${item.id}`,
                            userId: reviewerId
                        },
                        connection
                    );
                }

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
                     SET status = 'approved', reviewed_by = ?, approved_at = NOW()
                     WHERE id = ?`,
                    [reviewerId, item.id]
                );


                await AuditService.notifyUsers(
                    [item.worker_user_id],
                    {
                        type: "report_approved",
                        title: "Báo cáo đã được duyệt",
                        message: `Báo cáo ngày ${workDate}, ca ${item.shift || "-"}, sản phẩm ${item.product_name || "-"} đã được duyệt.`,
                        linkUrl: `/worker/history/${approvedReportId}?source=approved`,
                        entityType: "approved_report",
                        entityId: approvedReportId
                    },
                    connection
                );
            }

            await commit(connection);
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

    async rejectSelected(ids, reviewerId, reason, isAdmin = false) {
        const reportIds = normalizeIds(ids);
        const cleanReason = String(reason || "").trim();
        if (reportIds.length === 0) throw new Error("Danh sách báo cáo không hợp lệ");
        if (!cleanReason) throw new Error("Vui lòng nhập lý do từ chối");

        const connection = await getConnection();
        try {
            await beginTransaction(connection);
            const placeholders = reportIds.map(() => "?").join(",");
            const scopeJoin = isAdmin ? "" : "JOIN manager_processes mp ON mp.process_id = temp.process_id";
            const scopeWhere = isAdmin ? "" : "AND mp.manager_id = ?";
            const rows = await query(
                connection,
                `SELECT DISTINCT temp.id, temp.worker_id, temp.process_id, temp.work_date, temp.shift,
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
                await query(
                    connection,
                    `UPDATE production_reports_temp
                     SET status = 'rejected', review_note = ?, reviewed_by = ?, updated_at = NOW()
                     WHERE id = ?`,
                    [cleanReason, reviewerId, row.id]
                );

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

                await AuditService.notifyUsers(
                    [row.worker_user_id],
                    {
                        type: "report_rejected",
                        title: "Báo cáo đã bị từ chối",
                        message: `Báo cáo ngày ${String(row.work_date).slice(0, 10)} ca ${row.shift || "-"} bị từ chối: ${cleanReason}`,
                        linkUrl: `/worker/history/${row.id}?source=pending`,
                        entityType: "temp_report",
                        entityId: row.id
                    },
                    connection
                );
            }

            await commit(connection);
            return { count: rows.length, ids: rows.map((row) => row.id) };
        } catch (error) {
            await rollback(connection);
            throw error;
        } finally {
            connection.release();
        }
    }
};
