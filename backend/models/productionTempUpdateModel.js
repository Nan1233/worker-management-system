const AuditService = require("../services/auditService");
const { query, getConnection, beginTransaction, commit, rollback, normalizeIds, editableFields } = require("./productionTempModelShared");

module.exports = {
    async updateReport(id, data, changedBy, reason = null, options = {}) {
        const connection = await getConnection();

        try {
            await beginTransaction(connection);

            const { isAdmin = false, workerId = null } = options;
            const isWorkerEdit = Number(workerId) > 0;

            const scopeJoin = isAdmin || isWorkerEdit
                ? ""
                : "JOIN manager_processes mp ON mp.process_id = pr.process_id";

            const scopeWhere = isAdmin
                ? ""
                : isWorkerEdit
                    ? "AND pr.worker_id = ?"
                    : "AND mp.manager_id = ?";

            const rows = await query(
                connection,
                `SELECT pr.*
                 FROM production_reports_temp pr
                 ${scopeJoin}
                 WHERE pr.id = ? ${scopeWhere}
                 FOR UPDATE`,
                isAdmin
                    ? [id]
                    : isWorkerEdit
                        ? [id, workerId]
                        : [id, changedBy]
            );

            const current = rows[0];

            if (!current) {
                throw new Error(
                    "Không tìm thấy báo cáo hoặc ngoài phạm vi phụ trách"
                );
            }

            if (current.status === "approved") {
                throw new Error(
                    "Báo cáo đã duyệt không thể sửa ở bảng tạm"
                );
            }

            if (options.expectedUpdatedAt && new Date(options.expectedUpdatedAt).getTime() !== new Date(current.updated_at).getTime()) {
                const error = new Error("Báo cáo đã thay đổi sau khi bạn mở. Hãy tải lại dữ liệu trước khi sửa hoặc gửi lại.");
                error.status = 409;
                error.code = "TEMP_REPORT_VERSION_CONFLICT";
                throw error;
            }


            const resubmittingRejected =
                isWorkerEdit && current.status === "rejected";

            const hasDeductions =
                Object.prototype.hasOwnProperty.call(
                    data,
                    "deductions"
                );

            const hasDefects =
                Object.prototype.hasOwnProperty.call(
                    data,
                    "defects"
                );

            const hasMachineLines =
                Object.prototype.hasOwnProperty.call(data, "machine_lines");

            const deductions = Array.isArray(data.deductions)
                ? data.deductions
                : [];

            const defects = Array.isArray(data.defects)
                ? data.defects
                : [];

            const normalizedDeductions = [];
            for (const item of deductions) {
                let deductionTypeId =
                    Number(item.deduction_type_id) || null;

                if (
                    !deductionTypeId &&
                    String(item.deduction_name || "").trim()
                ) {
                    const typeRows = await query(
                        connection,
                        `SELECT id
                         FROM deduction_types
                         WHERE process_id = ?
                           AND deduction_name = ?
                           AND status = 'active'
                         LIMIT 1`,
                        [
                            current.process_id,
                            String(
                                item.deduction_name
                            ).trim()
                        ]
                    );

                    deductionTypeId =
                        typeRows[0]?.id || null;
                }

                if (!deductionTypeId) {
                    throw new Error(
                        `Nội dung thời gian trừ "${String(
                            item.deduction_name || ""
                        ).trim() || "không xác định"}" không tồn tại trong công đoạn`
                    );
                }

                normalizedDeductions.push({
                    deduction_type_id:
                        deductionTypeId,
                    hours: Math.max(
                        0,
                        Number(item.hours) || 0
                    )
                });
            }

            const normalizedDefects = [];
            for (const item of defects) {
                let defectTypeId =
                    Number(item.defect_type_id) || null;

                if (
                    !defectTypeId &&
                    String(item.defect_name || "").trim()
                ) {
                    const typeRows = await query(
                        connection,
                        `SELECT id
                         FROM defect_types
                         WHERE process_id = ?
                           AND defect_name = ?
                           AND status = 'active'
                         LIMIT 1`,
                        [
                            current.process_id,
                            String(
                                item.defect_name
                            ).trim()
                        ]
                    );

                    defectTypeId =
                        typeRows[0]?.id || null;
                }

                if (!defectTypeId) {
                    throw new Error(
                        `Loại NG "${String(
                            item.defect_name || ""
                        ).trim() || "không xác định"}" không tồn tại trong công đoạn`
                    );
                }

                normalizedDefects.push({
                    defect_type_id:
                        defectTypeId,
                    quantity: Math.max(
                        0,
                        Math.trunc(
                            Number(item.quantity) || 0
                        )
                    )
                });
            }

            const detailValues = {
                deduction_time:
                    normalizedDeductions.reduce(
                        (sum, item) =>
                            sum + item.hours,
                        0
                    ),
                tt_ng:
                    normalizedDefects.reduce(
                        (sum, item) =>
                            sum + item.quantity,
                        0
                    )
            };

            const totalTime = Math.max(
                0,
                Number(
                    Object.prototype.hasOwnProperty.call(
                        data,
                        "total_time"
                    )
                        ? data.total_time
                        : current.total_time
                ) || 0
            );

            const actualOutput = Math.max(
                0,
                Math.trunc(
                    Number(
                        Object.prototype.hasOwnProperty.call(
                            data,
                            "actual_output"
                        )
                            ? data.actual_output
                            : current.actual_output
                    ) || 0
                )
            );

            if (hasDeductions) {
                data.deduction_time =
                    detailValues.deduction_time;

                const actualTime = Math.max(
                    0,
                    Number(
                        Object.prototype.hasOwnProperty.call(data, "actual_time")
                            ? data.actual_time
                            : current.actual_time
                    ) || 0
                );
                data.actual_time = actualTime;
                data.total_time = actualTime + detailValues.deduction_time;
            }

            if (hasDefects) {
                data.tt_ng =
                    detailValues.tt_ng;

                data.tt_ok = Math.max(
                    0,
                    actualOutput -
                        detailValues.tt_ng
                );
            }

            const changes = editableFields
                .filter(field =>
                    Object.prototype.hasOwnProperty.call(
                        data,
                        field
                    )
                )
                .filter(
                    field =>
                        String(
                            current[field] ?? ""
                        ) !==
                        String(
                            data[field] ?? ""
                        )
                );

            const detailChanged =
                hasDeductions ||
                hasDefects ||
                hasMachineLines;

            if (
                changes.length === 0 &&
                !detailChanged
            ) {
                await rollback(connection);

                return {
                    changed: false,
                    report: current
                };
            }

            if (changes.length > 0) {
                const assignments = changes
                    .map(
                        field =>
                            `\`${field}\` = ?`
                    )
                    .join(", ");

                await query(
                    connection,
                    `UPDATE production_reports_temp
                     SET ${assignments},
                         updated_by = ?,
                         updated_at = NOW()
                         ${resubmittingRejected ? ", status = 'pending', review_note = NULL, reviewed_by = NULL, approved_at = NULL" : ""}
                     WHERE id = ?`,
                    [
                        ...changes.map(
                            field => data[field]
                        ),
                        changedBy,
                        id
                    ]
                );

                for (const field of changes) {
                    await query(
                        connection,
                        `INSERT INTO report_edit_logs
                         (
                            report_type,
                            report_id,
                            changed_by,
                            field_name,
                            old_value,
                            new_value,
                            reason
                         )
                         VALUES (
                            'temp',
                            ?,
                            ?,
                            ?,
                            ?,
                            ?,
                            ?
                         )`,
                        [
                            id,
                            changedBy,
                            field,
                            current[field] ?? null,
                            data[field] ?? null,
                            reason
                        ]
                    );
                }
            } else {
                await query(
                    connection,
                    `UPDATE production_reports_temp
                     SET updated_by = ?,
                         updated_at = NOW()
                         ${resubmittingRejected ? ", status = 'pending', review_note = NULL, reviewed_by = NULL, approved_at = NULL" : ""}
                     WHERE id = ?`,
                    [changedBy, id]
                );
            }

            if (hasDeductions) {
                await query(
                    connection,
                    `DELETE FROM production_temp_deductions
                     WHERE temp_report_id = ?`,
                    [id]
                );

                for (
                    const item of
                    normalizedDeductions
                ) {
                    await query(
                        connection,
                        `INSERT INTO production_temp_deductions
                         (
                            temp_report_id,
                            deduction_type_id,
                            hours
                         )
                         VALUES (?, ?, ?)`,
                        [
                            id,
                            item.deduction_type_id,
                            item.hours
                        ]
                    );
                }

                await query(
                    connection,
                    `INSERT INTO report_edit_logs
                     (
                        report_type,
                        report_id,
                        changed_by,
                        field_name,
                        old_value,
                        new_value,
                        reason
                     )
                     VALUES (
                        'temp',
                        ?,
                        ?,
                        'deductions',
                        ?,
                        ?,
                        ?
                     )`,
                    [
                        id,
                        changedBy,
                        "Chi tiết cũ",
                        JSON.stringify(
                            normalizedDeductions
                        ),
                        reason
                    ]
                );
            }

            if (hasDefects) {
                await query(
                    connection,
                    `DELETE FROM production_temp_defects
                     WHERE temp_report_id = ?`,
                    [id]
                );

                for (
                    const item of
                    normalizedDefects
                ) {
                    await query(
                        connection,
                        `INSERT INTO production_temp_defects
                         (
                            temp_report_id,
                            defect_type_id,
                            quantity
                         )
                         VALUES (?, ?, ?)`,
                        [
                            id,
                            item.defect_type_id,
                            item.quantity
                        ]
                    );
                }

                await query(
                    connection,
                    `INSERT INTO report_edit_logs
                     (
                        report_type,
                        report_id,
                        changed_by,
                        field_name,
                        old_value,
                        new_value,
                        reason
                     )
                     VALUES (
                        'temp',
                        ?,
                        ?,
                        'defects',
                        ?,
                        ?,
                        ?
                     )`,
                    [
                        id,
                        changedBy,
                        "Chi tiết cũ",
                        JSON.stringify(
                            normalizedDefects
                        ),
                        reason
                    ]
                );
            }

            await this.logAction(
                {
                    reportType: "temp",
                    reportId: id,
                    userId: changedBy,
                    action: "UPDATE",
                    note:
                        reason ||
                        `Đã sửa ${
                            changes.length
                        } trường${
                            detailChanged
                                ? " và chi tiết"
                                : ""
                        }`
                },
                connection
            );

            await AuditService.logActivity(
                {
                    userId: changedBy,
                    action: "TEMP_REPORT_UPDATED",
                    entityType: "temp_report",
                    entityId: id,
                    description: `Cập nhật báo cáo chờ duyệt #${id}`,
                    metadata: {
                        changed_fields: changes,
                        deductions_changed: hasDeductions,
                        defects_changed: hasDefects,
                        reason: reason || null
                    }
                },
                connection
            );

            if (resubmittingRejected) {
                const reviewers = await query(
                    connection,
                    `SELECT DISTINCT u.id, u.role
                     FROM users u
                     LEFT JOIN manager_processes mp ON mp.manager_id = u.id
                     WHERE u.status = 'active'
                       AND (u.role = 'admin' OR (u.role IN ('manager','lead') AND mp.process_id = ?))`,
                    [current.process_id]
                );
                const reviewerGroups = { lead: [], manager: [], admin: [] };
                reviewers.forEach((reviewer) => {
                    if (reviewerGroups[reviewer.role]) reviewerGroups[reviewer.role].push(reviewer.id);
                });
                const notification = {
                    type: "report_resubmitted",
                    title: "Báo cáo đã được sửa và gửi lại",
                    message: `Báo cáo #${id} đã được công nhân chỉnh sửa sau khi bị từ chối và đang chờ duyệt lại.`,
                    entityType: "temp_report",
                    entityId: id
                };
                await Promise.all([
                    AuditService.notifyUsers(reviewerGroups.lead, { ...notification, linkUrl: "/lead/reports" }, connection),
                    AuditService.notifyUsers(reviewerGroups.manager, { ...notification, linkUrl: "/manager/reports" }, connection),
                    AuditService.notifyUsers(reviewerGroups.admin, { ...notification, linkUrl: "/admin/reports" }, connection)
                ]);
            }

            if (hasMachineLines) {
                await this.replaceMachineLines(
                    id,
                    Array.isArray(data.machine_lines) ? data.machine_lines : [],
                    connection
                );
            }

            await commit(connection);

            return {
                changed: true,
                fields: changes,
                details: {
                    deductions: hasDeductions,
                    defects: hasDefects,
                    machine_lines: hasMachineLines
                }
            };
        } catch (error) {
            await rollback(connection);
            throw error;
        } finally {
            connection.release();
        }
    }
};
