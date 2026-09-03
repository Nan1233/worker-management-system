const AuditService = require("../services/auditService");
const { recalculateReportOutput } = require("../services/kqdReportCalculationService");
const { query, getConnection, beginTransaction, commit, rollback, normalizeIds, editableFields } = require("./productionTempModelShared");
const { validateMachineWorkerCapacityLocked } = require("../services/factoryMachineRuleService");

const DAILY_HOURS_LIMIT = 12;

/**
 * Keep the 12h/day rule consistent for edits as well as new submissions.
 * actual_time is counted production time; deduction/support hours are excluded.
 * The advisory lock uses the same worker/date key as the create path so a
 * submission and an edit cannot pass the daily-hours check concurrently.
 */
const lockAndCheckDailyHours = async (connection, { workerId, workDate, incomingActualHours, excludeTempReportId = null }) => {
    const worker = Number(workerId);
    const date = String(workDate || "").slice(0, 10);
    const incoming = Number(incomingActualHours) || 0;

    if (!Number.isInteger(worker) || worker <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return null;
    }

    const lockName = `ktc:worker-daily-hours:${worker}:${date}`;
    const [lockRows] = await connection.query("SELECT GET_LOCK(?, 10) AS acquired", [lockName]);
    const locked = Number(lockRows?.[0]?.acquired) === 1;

    if (!locked) {
        const error = new Error("Không thể kiểm tra tổng giờ trong ngày, vui lòng gửi lại sau.");
        error.status = 503;
        error.code = "DAILY_HOURS_LOCK_TIMEOUT";
        error.isPublic = true;
        throw error;
    }

    try {
        const tempExcludeSql = excludeTempReportId ? "AND id <> ?" : "";
        const tempParams = excludeTempReportId
            ? [worker, date, excludeTempReportId]
            : [worker, date];

        const [approvedRows] = await connection.query(
            `SELECT COALESCE(SUM(COALESCE(actual_time, 0)), 0) AS counted_hours
             FROM production_reports
             WHERE worker_id = ?
               AND work_date = ?
               AND status <> 'deleted'`,
            [worker, date]
        );

        const [tempRows] = await connection.query(
            `SELECT COALESCE(SUM(COALESCE(actual_time, 0)), 0) AS counted_hours
             FROM production_reports_temp
             WHERE worker_id = ?
               AND work_date = ?
               ${tempExcludeSql}
               AND status IN ('pending', 'need_fix')`,
            tempParams
        );

        const existingHours =
            Number(approvedRows?.[0]?.counted_hours || 0) +
            Number(tempRows?.[0]?.counted_hours || 0);
        const projectedHours = existingHours + incoming;

        if (projectedHours > DAILY_HOURS_LIMIT + 0.000001) {
            const remainingHours = Math.max(0, DAILY_HOURS_LIMIT - existingHours);
            const error = new Error(
                `Tổng giờ làm được tính trong ngày không được vượt quá 12 giờ. ` +
                `Hiện đã có ${existingHours.toFixed(2)} giờ, báo cáo này thêm ${incoming.toFixed(2)} giờ, ` +
                `chỉ còn ${remainingHours.toFixed(2)} giờ.`
            );
            error.status = 422;
            error.code = "DAILY_WORKING_HOURS_LIMIT_EXCEEDED";
            error.isPublic = true;
            error.details = {
                worker_id: worker,
                work_date: date,
                existing_hours: Number(existingHours.toFixed(4)),
                incoming_hours: Number(incoming.toFixed(4)),
                projected_hours: Number(projectedHours.toFixed(4)),
                limit_hours: DAILY_HOURS_LIMIT,
                remaining_hours: Number(remainingHours.toFixed(4)),
                counted_field: "actual_time",
                excluded_from_daily_limit: "deduction_time / support hours"
            };
            throw error;
        }

        return { lockName, existingHours, incomingActualHours: incoming, projectedHours };
    } catch (error) {
        await connection.query("SELECT RELEASE_LOCK(?) AS released", [lockName]).catch(() => {});
        throw error;
    }
};

const releaseDailyHoursLock = async (connection, state) => {
    if (!connection || !state?.lockName) return;
    await connection.query("SELECT RELEASE_LOCK(?) AS released", [state.lockName]).catch(() => {});
};

module.exports = {
    async updateReport(id, data, changedBy, reason = null, options = {}) {
        const connection = await getConnection();
        let dailyHoursState = null;

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

            // Snapshot đầy đủ trước khi sửa để audit có thể so sánh dữ liệu thật,
            // bao gồm NG, thời gian trừ và từng dòng máy.
            const oldSnapshot = await AuditService.loadTempReportSnapshot(id, connection);

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

            // One report/detail type must be represented by one DB row.
            // Aggregate repeated UI entries before DELETE+INSERT so the UNIQUE
            // integrity indexes cannot be tripped by duplicate selections.
            const deductionTotalsByType = new Map();
            for (const item of normalizedDeductions) {
                deductionTotalsByType.set(
                    item.deduction_type_id,
                    (deductionTotalsByType.get(item.deduction_type_id) || 0) + item.hours
                );
            }
            normalizedDeductions.length = 0;
            normalizedDeductions.push(...[...deductionTotalsByType.entries()]
                .filter(([, hours]) => hours > 0)
                .map(([deduction_type_id, hours]) => ({ deduction_type_id, hours })));

            const defectTotalsByType = new Map();
            for (const item of normalizedDefects) {
                defectTotalsByType.set(
                    item.defect_type_id,
                    (defectTotalsByType.get(item.defect_type_id) || 0) + item.quantity
                );
            }
            normalizedDefects.length = 0;
            normalizedDefects.push(...[...defectTotalsByType.entries()]
                .filter(([, quantity]) => quantity > 0)
                .map(([defect_type_id, quantity]) => ({ defect_type_id, quantity: Math.trunc(quantity) })));

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
                data.tt_ng = detailValues.tt_ng;

                // F04: parent manual output is derived from the immutable KQD policy snapshot.
                // Never reconstruct OK as actual_output - total_ng because excluded KQD is already
                // absent from actual_output. Machine reports are authoritative from machine_lines.
                if (!hasMachineLines) {
                    const policySnapshot = Object.prototype.hasOwnProperty.call(data, "exclude_kqd_from_tt_snapshot")
                        ? data.exclude_kqd_from_tt_snapshot
                        : current.exclude_kqd_from_tt_snapshot;
                    if (policySnapshot === null || policySnapshot === undefined || String(policySnapshot).trim() === "") {
                        const error = new Error("Báo cáo cũ chưa có snapshot chính sách KQD");
                        error.status = 422;
                        error.code = "KQD_POLICY_SNAPSHOT_MISSING";
                        error.isPublic = true;
                        throw error;
                    }
                    const defectIds = normalizedDefects.map((item) => Number(item.defect_type_id)).filter(Boolean);
                    const codeRows = defectIds.length
                        ? await query(
                            connection,
                            `SELECT id, defect_code, defect_name FROM defect_types WHERE id IN (${defectIds.map(() => "?").join(",")})`,
                            defectIds
                        )
                        : [];
                    const byId = new Map(codeRows.map((row) => [Number(row.id), row]));
                    const calculationDefects = normalizedDefects.map((item) => ({
                        ...item,
                        defect_code: byId.get(Number(item.defect_type_id))?.defect_code || null,
                        defect_name: byId.get(Number(item.defect_type_id))?.defect_name || null
                    }));
                    const okValue = Object.prototype.hasOwnProperty.call(data, "tt_ok")
                        ? Number(data.tt_ok || 0)
                        : Number(current.tt_ok || 0);
                    const output = recalculateReportOutput({
                        ttOk: okValue,
                        defects: calculationDefects,
                        excludeKqdFromTtSnapshot: policySnapshot
                    });
                    data.tt_ok = output.ttOk;
                    data.actual_output = output.actualOutput;
                }
            }

            // Re-check the worker/day total using the final actual_time that will
            // be stored. The current temp row is excluded so an edit replaces its
            // previous counted time rather than adding the old value again.
            const nextWorkDate = Object.prototype.hasOwnProperty.call(data, "work_date")
                ? String(data.work_date || "").slice(0, 10)
                : String(current.work_date || "").slice(0, 10);
            const nextActualTime = Object.prototype.hasOwnProperty.call(data, "actual_time")
                ? Math.max(0, Number(data.actual_time) || 0)
                : Math.max(0, Number(current.actual_time) || 0);

            dailyHoursState = await lockAndCheckDailyHours(connection, {
                workerId: current.worker_id,
                workDate: nextWorkDate,
                incomingActualHours: nextActualTime,
                excludeTempReportId: id
            });

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
            }

            if (hasMachineLines) {
                const nextShift = Object.prototype.hasOwnProperty.call(data, 'shift') ? data.shift : current.shift;
                const processRows = await query(connection, `SELECT process_code FROM processes WHERE id=? LIMIT 1`, [Number(current.process_id)]);
                const lockedCapacity = await validateMachineWorkerCapacityLocked({
                    executor: connection,
                    processCode: processRows[0]?.process_code,
                    processId: current.process_id,
                    machineLines: Array.isArray(data.machine_lines) ? data.machine_lines : [],
                    workerId: current.worker_id,
                    workDate: nextWorkDate,
                    shift: nextShift,
                    excludeTempReportId: id
                });
                if (!lockedCapacity.valid) {
                    const error = new Error('Máy đã đủ số người cho phép trong ngày/ca');
                    error.status = 422; error.code = 'MACHINE_WORKER_LIMIT_EXCEEDED'; error.isPublic = true; error.details = lockedCapacity.errors;
                    throw error;
                }
                const preserveEventLinks = String(nextWorkDate).slice(0,10) === String(current.work_date).slice(0,10)
                    && String(nextShift || '').trim() === String(current.shift || '').trim();
                await this.replaceMachineLines(
                    id,
                    Array.isArray(data.machine_lines) ? data.machine_lines : [],
                    connection,
                    { preserveEventLinks }
                );
            }

            const newSnapshot = await AuditService.loadTempReportSnapshot(id, connection);
            const changedFieldsForAudit = [
                ...changes,
                ...(hasDeductions ? ["deductions"] : []),
                ...(hasDefects ? ["defects"] : []),
                ...(hasMachineLines ? ["machine_lines"] : []),
                ...(resubmittingRejected ? ["status", "review_note", "reviewed_by"] : [])
            ];

            await query(
                connection,
                `INSERT INTO report_edit_logs
                 (report_type, report_id, user_id, old_data, new_data, changed_fields, note)
                 VALUES ('temp', ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    changedBy,
                    JSON.stringify(oldSnapshot || null),
                    JSON.stringify(newSnapshot || null),
                    JSON.stringify(changedFieldsForAudit),
                    reason || (resubmittingRejected ? "Công nhân sửa và gửi lại báo cáo" : "Cập nhật báo cáo chờ duyệt")
                ]
            );

            if (newSnapshot) {
                await AuditService.createReportVersion({
                    reportType: "temp",
                    reportId: id,
                    snapshot: newSnapshot,
                    reason: reason || (resubmittingRejected ? "Gửi lại sau khi bị từ chối" : "Cập nhật báo cáo chờ duyệt"),
                    userId: changedBy
                }, connection);
            }

            await this.logAction(
                {
                    reportType: "temp",
                    reportId: id,
                    userId: changedBy,
                    action: resubmittingRejected ? "RESUBMIT" : "UPDATE",
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
                    action: resubmittingRejected ? "TEMP_REPORT_RESUBMITTED" : "TEMP_REPORT_UPDATED",
                    entityType: "temp_report",
                    entityId: id,
                    description: resubmittingRejected
                        ? `Gửi lại báo cáo chờ duyệt #${id} sau khi bị từ chối`
                        : `Cập nhật báo cáo chờ duyệt #${id}`,
                    metadata: {
                        changed_fields: changes,
                        deductions_changed: hasDeductions,
                        defects_changed: hasDefects,
                        machine_lines_changed: hasMachineLines,
                        previous_status: current.status,
                        new_status: resubmittingRejected ? "pending" : current.status,
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
            await releaseDailyHoursLock(connection, dailyHoursState);
            connection.release();
        }
    }
};