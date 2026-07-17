const db = require("../config/db");

const query = (executor, sql, params = []) =>
    new Promise((resolve, reject) => {
        executor.query(sql, params, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
    });

const getConnection = () =>
    new Promise((resolve, reject) => {
        db.getConnection((error, connection) => {
            if (error) return reject(error);
            resolve(connection);
        });
    });

const beginTransaction = (connection) =>
    new Promise((resolve, reject) => {
        connection.beginTransaction((error) => {
            if (error) return reject(error);
            resolve();
        });
    });

const commit = (connection) =>
    new Promise((resolve, reject) => {
        connection.commit((error) => {
            if (error) return reject(error);
            resolve();
        });
    });

const rollback = (connection) =>
    new Promise((resolve) => connection.rollback(resolve));

const normalizeIds = (ids) => [
    ...new Set(
        (Array.isArray(ids) ? ids : [])
            .map(Number)
            .filter((id) => Number.isInteger(id) && id > 0)
    )
];

const editableFields = [
    "work_date",
    "shift",
    "machine_no",
    "product_name",
    "total_time",
    "actual_time",
    "deduction_time",
    "standard_output",
    "actual_output",
    "tt_ok",
    "tt_ng",
    "note"
];

const ProductionTemp = {
    async create(data, executor = db) {
        const sql = `
            INSERT INTO production_reports_temp
            (
                worker_id, process_id, work_date, shift, machine_no,
                product_name, total_time, actual_time, deduction_time,
                standard_output, actual_output, tt_ok, tt_ng, note, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `;

        const result = await query(executor, sql, [
            data.worker_id,
            data.process_id,
            data.work_date,
            data.shift,
            data.machine_no || null,
            data.product_name || null,
            Number(data.total_time) || 0,
            Number(data.actual_time) || 0,
            Number(data.deduction_time) || 0,
            Number(data.standard_output) || 0,
            Number(data.actual_output) || 0,
            Number(data.tt_ok) || 0,
            Number(data.tt_ng) || 0,
            data.note || ""
        ]);

        return result.insertId;
    },

    async createDefects(tempReportId, processId, defects, executor = db) {
        if (!Array.isArray(defects) || defects.length === 0) return;

        for (const item of defects) {
            let defectTypeId = Number(item.defect_type_id) || null;

            if (!defectTypeId && item.defect_name) {
                const rows = await query(
                    executor,
                    `SELECT id FROM defect_types
                     WHERE process_id = ? AND defect_name = ? AND status = 'active'
                     LIMIT 1`,
                    [processId, item.defect_name]
                );
                defectTypeId = rows[0]?.id || null;
            }

            if (!defectTypeId) continue;

            await query(
                executor,
                `INSERT INTO production_temp_defects
                 (temp_report_id, defect_type_id, quantity)
                 VALUES (?, ?, ?)`,
                [tempReportId, defectTypeId, Number(item.quantity) || 0]
            );
        }
    },

    async createDeductions(tempReportId, processId, deductions, executor = db) {
        if (!Array.isArray(deductions) || deductions.length === 0) return;

        for (const item of deductions) {
            let deductionTypeId = Number(item.deduction_type_id) || null;

            if (!deductionTypeId && item.deduction_name) {
                const rows = await query(
                    executor,
                    `SELECT id FROM deduction_types
                     WHERE process_id = ? AND deduction_name = ? AND status = 'active'
                     LIMIT 1`,
                    [processId, item.deduction_name]
                );
                deductionTypeId = rows[0]?.id || null;
            }

            if (!deductionTypeId) continue;

            await query(
                executor,
                `INSERT INTO production_temp_deductions
                 (temp_report_id, deduction_type_id, hours)
                 VALUES (?, ?, ?)`,
                [tempReportId, deductionTypeId, Number(item.hours) || 0]
            );
        }
    },

    async logAction({ reportType = "temp", reportId, userId, action, note = null, ipAddress = null, userAgent = null }, executor = db) {
        if (!reportId || !userId || !action) return;

        await query(
            executor,
            `INSERT INTO report_action_logs
             (report_type, report_id, user_id, action, note, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [reportType, reportId, userId, action, note, ipAddress, userAgent]
        );
    },


    async createCompleteReport({ data, defects = [], deductions = [], log }) {
        const connection = await getConnection();
        try {
            await beginTransaction(connection);
            const tempId = await this.create(data, connection);
            await this.createDefects(tempId, data.process_id, defects, connection);
            await this.createDeductions(tempId, data.process_id, deductions, connection);
            await this.logAction({ ...log, reportId: tempId }, connection);
            await commit(connection);
            return tempId;
        } catch (error) {
            await rollback(connection);
            throw error;
        } finally {
            connection.release();
        }
    },
    async getPending(managerId, filters = {}, isAdmin = false) {
        const params = [];
        const conditions = ["pr.status IN ('pending', 'need_fix')"];
        if (!isAdmin) {
            conditions.push("mp.manager_id = ?");
            params.push(managerId);
        }

        if (filters.date) {
            conditions.push("DATE(pr.work_date) = ?");
            params.push(filters.date);
        }
        if (filters.shift) {
            conditions.push("pr.shift = ?");
            params.push(filters.shift);
        }
        if (filters.process_id) {
            conditions.push("pr.process_id = ?");
            params.push(filters.process_id);
        }
        if (filters.search) {
            conditions.push("(w.worker_code LIKE ? OR u.full_name LIKE ? OR pr.machine_no LIKE ? OR pr.product_name LIKE ?)");
            const search = `%${filters.search}%`;
            params.push(search, search, search, search);
        }

        return query(
            db,
            `SELECT
                pr.*, w.worker_code, u.full_name, p.process_name,
                CASE WHEN dup.duplicate_count > 1 THEN 1 ELSE 0 END AS is_duplicate,
                COALESCE(dup.duplicate_count, 1) AS duplicate_count
             FROM production_reports_temp pr
             JOIN workers w ON pr.worker_id = w.id
             JOIN users u ON w.user_id = u.id
             JOIN processes p ON pr.process_id = p.id
             JOIN manager_processes mp ON mp.process_id = pr.process_id
             LEFT JOIN (
                SELECT work_date, shift, machine_no, product_name, COUNT(*) AS duplicate_count
                FROM production_reports_temp
                WHERE status IN ('pending', 'need_fix')
                GROUP BY work_date, shift, machine_no, product_name
             ) dup
                ON dup.work_date = pr.work_date
               AND dup.shift = pr.shift
               AND COALESCE(dup.machine_no, '') = COALESCE(pr.machine_no, '')
               AND COALESCE(dup.product_name, '') = COALESCE(pr.product_name, '')
             WHERE ${conditions.join(" AND ")}
             ORDER BY pr.work_date DESC, pr.created_at ASC`,
            params
        );
    },

    async getApproved(managerId, filters = {}, isAdmin = false) {
        const params = [];
        const conditions = ["pr.status = 'approved'"];
        if (!isAdmin) {
            conditions.push("mp.manager_id = ?");
            params.push(managerId);
        }

        if (filters.date) {
            conditions.push("DATE(pr.work_date) = ?");
            params.push(filters.date);
        }
        if (filters.shift) {
            conditions.push("pr.shift = ?");
            params.push(filters.shift);
        }
        if (filters.process_id) {
            conditions.push("pr.process_id = ?");
            params.push(filters.process_id);
        }
        if (filters.search) {
            conditions.push("(w.worker_code LIKE ? OR u.full_name LIKE ? OR pr.machine_no LIKE ? OR pr.product_name LIKE ?)");
            const search = `%${filters.search}%`;
            params.push(search, search, search, search);
        }

        return query(
            db,
            `SELECT pr.*, w.worker_code, u.full_name, p.process_name,
                    reviewer.full_name AS reviewer_name
             FROM production_reports pr
             JOIN workers w ON pr.worker_id = w.id
             JOIN users u ON w.user_id = u.id
             JOIN processes p ON pr.process_id = p.id
             JOIN manager_processes mp ON mp.process_id = pr.process_id
             LEFT JOIN users reviewer ON reviewer.id = pr.reviewed_by
             WHERE ${conditions.join(" AND ")}
             ORDER BY pr.approved_at DESC, pr.id DESC`,
            params
        );
    },

    async getDates(
    managerId = null
) {
    if (managerId) {
        return query(
            db,
            `
                SELECT DISTINCT
                    DATE(pr.work_date) AS date

                FROM production_reports_temp pr

                JOIN manager_processes mp
                    ON mp.process_id =
                       pr.process_id

                WHERE mp.manager_id = ?
                  AND pr.status IN (
                        'pending',
                        'need_fix'
                  )

                ORDER BY date DESC
            `,
            [
                managerId
            ]
        );
    }

    return query(
        db,
        `
            SELECT DISTINCT
                DATE(work_date) AS date

            FROM production_reports_temp

            WHERE status IN (
                'pending',
                'need_fix'
            )

            ORDER BY date DESC
        `
    );
},

    async getByDate(
    date,
    managerId = null
) {
    const params = [
        date
    ];

    let scope = "";

    if (managerId) {
        scope =
            " AND mp.manager_id = ?";

        params.push(
            managerId
        );
    }

    return query(
        db,
        `
            SELECT
                pr.*,
                w.worker_code,
                u.full_name,
                p.process_name,

                CASE
                    WHEN dup.duplicate_count > 1
                    THEN 1
                    ELSE 0
                END AS is_duplicate,

                COALESCE(
                    dup.duplicate_count,
                    1
                ) AS duplicate_count

            FROM production_reports_temp pr

            JOIN workers w
                ON pr.worker_id = w.id

            JOIN users u
                ON w.user_id = u.id

            JOIN processes p
                ON pr.process_id = p.id

            LEFT JOIN manager_processes mp
                ON mp.process_id = pr.process_id

            LEFT JOIN (
                SELECT
                    work_date,
                    shift,
                    machine_no,
                    product_name,
                    COUNT(*) AS duplicate_count

                FROM production_reports_temp

                WHERE status IN (
                    'pending',
                    'need_fix'
                )

                GROUP BY
                    work_date,
                    shift,
                    machine_no,
                    product_name
            ) dup
                ON dup.work_date = pr.work_date
                AND dup.shift = pr.shift
                AND COALESCE(
                    dup.machine_no,
                    ''
                ) = COALESCE(
                    pr.machine_no,
                    ''
                )
                AND COALESCE(
                    dup.product_name,
                    ''
                ) = COALESCE(
                    pr.product_name,
                    ''
                )

            WHERE DATE(pr.work_date) = ?
              AND pr.status IN (
                    'pending',
                    'need_fix'
              )
              ${scope}

            ORDER BY
                pr.created_at ASC
        `,
        params
    );
},

    async getDetail(id) {
        const rows = await query(
            db,
            `SELECT pr.*, w.worker_code, u.full_name, p.process_name,
                    reviewer.full_name AS reviewer_name
             FROM production_reports_temp pr
             JOIN workers w ON pr.worker_id = w.id
             JOIN users u ON w.user_id = u.id
             JOIN processes p ON pr.process_id = p.id
             LEFT JOIN users reviewer ON reviewer.id = pr.reviewed_by
             WHERE pr.id = ?
             LIMIT 1`,
            [id]
        );

        if (!rows[0]) return null;

        const [defects, deductions] = await Promise.all([
            query(
                db,
                `SELECT d.id, d.defect_type_id, dt.defect_code, dt.defect_name, d.quantity
                 FROM production_temp_defects d
                 JOIN defect_types dt ON dt.id = d.defect_type_id
                 WHERE d.temp_report_id = ?
                 ORDER BY dt.sort_order, dt.id`,
                [id]
            ),
            query(
                db,
                `SELECT d.id, d.deduction_type_id, dt.deduction_code, dt.deduction_name, d.hours
                 FROM production_temp_deductions d
                 JOIN deduction_types dt ON dt.id = d.deduction_type_id
                 WHERE d.temp_report_id = ?
                 ORDER BY dt.sort_order, dt.id`,
                [id]
            )
        ]);

        return { ...rows[0], defects, deductions };
    },

    async canManageReport(reportId, managerId, isAdmin = false) {
        if (isAdmin) return true;
        const rows = await query(
            db,
            `SELECT 1
             FROM production_reports_temp pr
             JOIN manager_processes mp ON mp.process_id = pr.process_id
             WHERE pr.id = ? AND mp.manager_id = ?
             LIMIT 1`,
            [reportId, managerId]
        );
        return rows.length > 0;
    },

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
                `SELECT DISTINCT temp.*
                 FROM production_reports_temp temp
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
                const insertResult = await query(
                    connection,
                    `INSERT INTO production_reports
                     (source_temp_id, worker_id, process_id, work_date, shift, machine_no,
                      product_name, total_time, actual_time, deduction_time,
                      standard_output, actual_output, tt_ok, tt_ng, note,
                      status, review_note, reviewed_by, approved_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                             'approved', ?, ?, NOW())`,
                    [
                        item.id, item.worker_id, item.process_id, item.work_date,
                        item.shift, item.machine_no, item.product_name,
                        item.total_time, item.actual_time, item.deduction_time,
                        item.standard_output, item.actual_output, item.tt_ok,
                        item.tt_ng, item.note, item.review_note, reviewerId
                    ]
                );

                const approvedReportId = insertResult.insertId;
                approvedIds.push(approvedReportId);
                dates.add(new Date(item.work_date).toISOString().slice(0, 10));

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

                await query(
                    connection,
                    `UPDATE production_reports_temp
                     SET status = 'approved', reviewed_by = ?, approved_at = NOW()
                     WHERE id = ?`,
                    [reviewerId, item.id]
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

    // async rejectSelected(ids, reviewerId, reason, isAdmin = false) {
    //     const reportIds = normalizeIds(ids);
    //     if (reportIds.length === 0) throw new Error("Danh sách báo cáo không hợp lệ");
    //     if (!String(reason || "").trim()) throw new Error("Vui lòng nhập lý do từ chối");

    //     const connection = await getConnection();
    //     try {
    //         await beginTransaction(connection);
    //         const placeholders = reportIds.map(() => "?").join(",");
    //         const scopeJoin = isAdmin ? "" : "JOIN manager_processes mp ON mp.process_id = temp.process_id";
    //         const scopeWhere = isAdmin ? "" : "AND mp.manager_id = ?";
    //         const rows = await query(
    //             connection,
    //             `SELECT DISTINCT temp.id
    //              FROM production_reports_temp temp
    //              ${scopeJoin}
    //              WHERE temp.id IN (${placeholders})
    //                AND temp.status IN ('pending', 'need_fix')
    //                ${scopeWhere}
    //              FOR UPDATE`,
    //             isAdmin ? reportIds : [...reportIds, reviewerId]
    //         );

    //         if (rows.length !== reportIds.length) {
    //             throw new Error("Có báo cáo không tồn tại, đã xử lý hoặc ngoài phạm vi phụ trách");
    //         }

    //         for (const row of rows) {
    //             await query(
    //                 connection,
    //                 `UPDATE production_reports_temp
    //                  SET status = 'rejected', review_note = ?, reviewed_by = ?
    //                  WHERE id = ?`,
    //                 [String(reason).trim(), reviewerId, row.id]
    //             );

    //             await this.logAction(
    //                 {
    //                     reportType: "temp",
    //                     reportId: row.id,
    //                     userId: reviewerId,
    //                     action: "REJECT",
    //                     note: String(reason).trim()
    //                 },
    //                 connection
    //             );
    //         }

    //         await commit(connection);
    //         return { count: rows.length, ids: rows.map((row) => row.id) };
    //     } catch (error) {
    //         await rollback(connection);
    //         throw error;
    //     } finally {
    //         connection.release();
    //     }
    // },

    async updateReport(id, data, changedBy, reason = null, isAdmin = false) {
        const connection = await getConnection();

        try {
            await beginTransaction(connection);

            const scopeJoin = isAdmin
                ? ""
                : "JOIN manager_processes mp ON mp.process_id = pr.process_id";

            const scopeWhere = isAdmin
                ? ""
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

                data.actual_time = Math.max(
                    0,
                    totalTime -
                        detailValues.deduction_time
                );
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
                hasDefects;

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

            await commit(connection);

            return {
                changed: true,
                fields: changes,
                details: {
                    deductions: hasDeductions,
                    defects: hasDefects
                }
            };
        } catch (error) {
            await rollback(connection);
            throw error;
        } finally {
            connection.release();
        }
    },

    async getActionLogs(reportId, reportType = "temp") {
        return query(
            db,
            `SELECT l.*, u.username, u.full_name, u.role
             FROM report_action_logs l
             JOIN users u ON u.id = l.user_id
             WHERE l.report_type = ? AND l.report_id = ?
             ORDER BY l.created_at DESC, l.id DESC`,
            [reportType, reportId]
        );
    },

    async getHistoryByWorker(workerId) {
        return query(
            db,
            `SELECT * FROM (
                SELECT pr.id, 'approved' AS source, pr.worker_id, pr.process_id,
                       pr.work_date, pr.shift, pr.machine_no, pr.product_name,
                       pr.standard_output, pr.actual_output, pr.total_time,
                       pr.actual_time, pr.deduction_time, pr.tt_ok, pr.tt_ng,
                       pr.status, pr.review_note, pr.created_at, pr.approved_at,
                       p.process_name
                FROM production_reports pr
                LEFT JOIN processes p ON pr.process_id = p.id
                WHERE pr.worker_id = ?

                UNION ALL

                SELECT temp.id, 'temp' AS source, temp.worker_id, temp.process_id,
                       temp.work_date, temp.shift, temp.machine_no, temp.product_name,
                       temp.standard_output, temp.actual_output, temp.total_time,
                       temp.actual_time, temp.deduction_time, temp.tt_ok, temp.tt_ng,
                       temp.status, temp.review_note, temp.created_at, temp.approved_at,
                       p.process_name
                FROM production_reports_temp temp
                LEFT JOIN processes p ON temp.process_id = p.id
                WHERE temp.worker_id = ? AND temp.status <> 'approved'
             ) history
             ORDER BY created_at DESC`,
            [workerId, workerId]
        );
    }
};

module.exports = ProductionTemp;
