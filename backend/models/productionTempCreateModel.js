const db = require("../config/db");
const { query, getConnection, beginTransaction, commit, rollback } = require("./productionTempModelShared");

module.exports = {
    async create(data, executor = db) {
        const sql = `
            INSERT INTO production_reports_temp
            (
                worker_id, process_id, work_date, entry_date, shift,
                operation_type, operation_mode, machine_no,
                product_name, total_time, actual_time, deduction_time,
                standard_output, actual_output, tt_ok, tt_ng, note, extra_data,
                client_request_id, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `;

        const result = await query(executor, sql, [
            data.worker_id,
            data.process_id,
            data.work_date,
            data.entry_date || new Date().toISOString().slice(0, 10),
            data.shift,
            data.operation_type ?? data.operationType ?? null,
            data.operation_mode ?? data.operationMode ?? null,
            data.machine_no || null,
            data.product_name || null,
            Number(data.total_time) || 0,
            Number(data.actual_time) || 0,
            Number(data.deduction_time) || 0,
            Number(data.standard_output) || 0,
            Number(data.actual_output) || 0,
            Number(data.tt_ok) || 0,
            Number(data.tt_ng) || 0,
            data.note || "",
            JSON.stringify(data.extra_data || {}),
            data.client_request_id || null
        ]);

        return result.insertId;
    },


    async findByClientRequest(workerId, clientRequestId, executor = db) {
        if (!workerId || !clientRequestId) return null;
        const rows = await query(
            executor,
            `SELECT id, status FROM production_reports_temp
             WHERE worker_id = ? AND client_request_id = ? LIMIT 1`,
            [workerId, clientRequestId]
        );
        return rows[0] || null;
    },

    async findSimilarReport({ workerId, processId, workDate, shift, machineNo, productName }, executor = db) {
        const rows = await query(
            executor,
            `SELECT id, status, work_date, shift, machine_no, product_name, created_at, updated_at
             FROM production_reports_temp
             WHERE worker_id = ?
               AND process_id = ?
               AND work_date = ?
               AND shift = ?
               AND machine_no <=> ?
               AND product_name <=> ?
               AND status IN ('pending', 'need_fix')
             ORDER BY created_at DESC, id DESC
             LIMIT 1`,
            [workerId, processId, workDate, shift, machineNo, productName]
        );
        return rows[0] || null;
    },


    async findRecentIdentical(data, executor = db) {
        const rows = await query(
            executor,
            `SELECT id, status
             FROM production_reports_temp
             WHERE worker_id = ?
               AND process_id = ?
               AND work_date = ?
               AND shift = ?
               AND machine_no <=> ?
               AND product_name <=> ?
               AND total_time = ?
               AND actual_time = ?
               AND deduction_time = ?
               AND actual_output = ?
               AND tt_ok = ?
               AND tt_ng = ?
               AND created_at >= DATE_SUB(NOW(), INTERVAL 5 SECOND)
             ORDER BY id DESC
             LIMIT 1`,
            [
                data.worker_id, data.process_id, data.work_date, data.shift,
                data.machine_no || null, data.product_name || null,
                Number(data.total_time) || 0, Number(data.actual_time) || 0,
                Number(data.deduction_time) || 0, Number(data.actual_output) || 0,
                Number(data.tt_ok) || 0, Number(data.tt_ng) || 0
            ]
        );
        return rows[0] || null;
    },
    async createDefects(tempReportId, processId, defects, executor = db) {
        if (!Array.isArray(defects) || defects.length === 0) return;

        const validItems = defects
            .map((item) => ({
                defectTypeId: Number(item.defect_type_id) || null,
                defectName: String(item.defect_name || "").trim(),
                quantity: Number(item.quantity) || 0
            }))
            .filter((item) => item.quantity > 0);

        if (!validItems.length) return;

        const unresolvedNames = [
            ...new Set(
                validItems
                    .filter((item) => !item.defectTypeId && item.defectName)
                    .map((item) => item.defectName)
            )
        ];

        const nameToId = new Map();
        if (unresolvedNames.length) {
            const placeholders = unresolvedNames.map(() => "?").join(",");
            const rows = await query(
                executor,
                `SELECT id, defect_name
                 FROM defect_types
                 WHERE process_id = ?
                   AND status = 'active'
                   AND defect_name IN (${placeholders})`,
                [processId, ...unresolvedNames]
            );
            rows.forEach((row) => nameToId.set(String(row.defect_name), Number(row.id)));
        }

        const values = validItems
            .map((item) => [
                tempReportId,
                item.defectTypeId || nameToId.get(item.defectName) || null,
                item.quantity
            ])
            .filter((item) => item[1]);

        if (!values.length) return;

        const placeholders = values.map(() => "(?, ?, ?)").join(",");
        await query(
            executor,
            `INSERT INTO production_temp_defects
             (temp_report_id, defect_type_id, quantity)
             VALUES ${placeholders}`,
            values.flat()
        );
    },

    async createDeductions(tempReportId, processId, deductions, executor = db) {
        if (!Array.isArray(deductions) || deductions.length === 0) return;

        const validItems = deductions
            .map((item) => ({
                deductionTypeId: Number(item.deduction_type_id) || null,
                deductionName: String(item.deduction_name || "").trim(),
                hours: Number(item.hours) || 0
            }))
            .filter((item) => item.hours > 0);

        if (!validItems.length) return;

        const unresolvedNames = [
            ...new Set(
                validItems
                    .filter((item) => !item.deductionTypeId && item.deductionName)
                    .map((item) => item.deductionName)
            )
        ];

        const nameToId = new Map();
        if (unresolvedNames.length) {
            const placeholders = unresolvedNames.map(() => "?").join(",");
            const rows = await query(
                executor,
                `SELECT id, deduction_name
                 FROM deduction_types
                 WHERE process_id = ?
                   AND status = 'active'
                   AND deduction_name IN (${placeholders})`,
                [processId, ...unresolvedNames]
            );
            rows.forEach((row) => nameToId.set(String(row.deduction_name), Number(row.id)));
        }

        const values = validItems
            .map((item) => [
                tempReportId,
                item.deductionTypeId || nameToId.get(item.deductionName) || null,
                item.hours
            ])
            .filter((item) => item[1]);

        if (!values.length) return;

        const placeholders = values.map(() => "(?, ?, ?)").join(",");
        await query(
            executor,
            `INSERT INTO production_temp_deductions
             (temp_report_id, deduction_type_id, hours)
             VALUES ${placeholders}`,
            values.flat()
        );
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


    async replaceMachineLines(tempReportId, machineLines = [], executor = db) {
        const oldLines = await query(executor, `SELECT id FROM production_temp_machine_lines WHERE temp_report_id = ?`, [tempReportId]);
        if (oldLines.length) {
            const ids = oldLines.map((row) => Number(row.id)).filter(Boolean);
            if (ids.length) {
                await query(executor, `DELETE FROM production_temp_machine_defects WHERE machine_line_id IN (${ids.map(() => "?").join(",")})`, ids);
            }
        }
        await query(executor, `DELETE FROM production_temp_machine_lines WHERE temp_report_id = ?`, [tempReportId]);
        if (!Array.isArray(machineLines) || machineLines.length === 0) return;

        for (let index = 0; index < Math.min(machineLines.length, 4); index += 1) {
            const line = machineLines[index] || {};
            const result = await query(executor, `INSERT INTO production_temp_machine_lines
                (temp_report_id, machine_id, machine_code, product_standard_id, product_code,
                 machine_time_hours, standard_output, standard_time_seconds, standard_source, exclude_kqd_from_tt,
                 ok_quantity, ng_quantity, maximum_output, counted_output, earned_standard_hours,
                 defects_json, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                tempReportId,
                Number(line.machine_id) || null,
                String(line.machine_code || "").trim(),
                Number(line.product_standard_id) || null,
                String(line.product_code || "").trim(),
                Number(line.machine_time_hours) || 0,
                Number(line.standard_output) || 0,
                Number(line.standard_time_seconds) || null,
                String(line.standard_source || "DEFAULT").trim().toUpperCase(),
                Number(line.exclude_kqd_from_tt || 0) === 1 ? 1 : 0,
                Math.max(0, Math.trunc(Number(line.ok_quantity) || 0)),
                Math.max(0, Math.trunc(Number(line.ng_quantity) || 0)),
                Number(line.maximum_output) || 0,
                Number(line.counted_output) || 0,
                Number(line.earned_standard_hours) || 0,
                JSON.stringify(Array.isArray(line.defects) ? line.defects : []),
                index + 1
            ]);

            const machineLineId = Number(result.insertId);
            const defects = (Array.isArray(line.defects) ? line.defects : [])
                .map((item) => ({
                    defect_type_id: Number(item?.defect_id || item?.defect_type_id) || null,
                    defect_code: String(item?.defect_code || "").trim(),
                    defect_name: String(item?.defect_name || "").trim(),
                    quantity: Math.max(0, Math.trunc(Number(item?.quantity) || 0))
                }))
                .filter((item) => item.quantity > 0 && (item.defect_code || item.defect_name));
            if (defects.length) {
                const placeholders = defects.map(() => "(?, ?, ?, ?, ?)").join(",");
                await query(executor, `INSERT INTO production_temp_machine_defects
                    (machine_line_id, defect_type_id, defect_code, defect_name, quantity)
                    VALUES ${placeholders}`,
                    defects.flatMap((item) => [machineLineId, item.defect_type_id, item.defect_code, item.defect_name || null, item.quantity]));
            }
        }
    },

    async getTempMachineLines(tempReportId, executor = db) {
        const lines = await query(executor, `SELECT id, machine_id, machine_code, product_standard_id, product_code,
            machine_time_hours, standard_output, standard_time_seconds, standard_source, exclude_kqd_from_tt,
            ok_quantity, ng_quantity, maximum_output, counted_output, earned_standard_hours,
            defects_json, sort_order
            FROM production_temp_machine_lines WHERE temp_report_id = ? ORDER BY sort_order, id`, [tempReportId]);
        if (!lines.length) return lines;
        const ids = lines.map((line) => Number(line.id));
        const defects = await query(executor, `SELECT machine_line_id, defect_type_id, defect_code, defect_name, quantity
            FROM production_temp_machine_defects WHERE machine_line_id IN (${ids.map(() => "?").join(",")}) ORDER BY id`, ids);
        const grouped = new Map();
        defects.forEach((item) => {
            const key = Number(item.machine_line_id);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(item);
        });
        return lines.map((line) => ({ ...line, defects: grouped.get(Number(line.id)) || (() => { try { return JSON.parse(line.defects_json || "[]"); } catch (_e) { return []; } })() }));
    },

    async copyMachineLinesToApproved(tempReportId, reportId, executor = db) {
        const tempLines = await this.getTempMachineLines(tempReportId, executor);
        for (const line of tempLines) {
            const result = await query(executor, `INSERT INTO production_report_machine_lines
                (report_id, machine_id, machine_code, product_standard_id, product_code,
                 machine_time_hours, standard_output, standard_time_seconds, standard_source, exclude_kqd_from_tt,
                 ok_quantity, ng_quantity, maximum_output, counted_output, earned_standard_hours,
                 defects_json, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                reportId, line.machine_id, line.machine_code, line.product_standard_id, line.product_code,
                line.machine_time_hours, line.standard_output, line.standard_time_seconds, line.standard_source, line.exclude_kqd_from_tt,
                line.ok_quantity, line.ng_quantity, line.maximum_output, line.counted_output,
                line.earned_standard_hours, JSON.stringify(line.defects || []), line.sort_order
            ]);
            const approvedLineId = Number(result.insertId);
            const defects = Array.isArray(line.defects) ? line.defects : [];
            if (defects.length) {
                const placeholders = defects.map(() => "(?, ?, ?, ?, ?)").join(",");
                await query(executor, `INSERT INTO production_report_machine_defects
                    (machine_line_id, defect_type_id, defect_code, defect_name, quantity)
                    VALUES ${placeholders}`,
                    defects.flatMap((item) => [approvedLineId, Number(item.defect_type_id || item.defect_id) || null, String(item.defect_code || ""), String(item.defect_name || "") || null, Math.max(0, Math.trunc(Number(item.quantity) || 0))]));
            }
        }
    },

    async createCompleteReport({ data, defects = [], deductions = [], machineLines = [], audit = null }) {
        const connection = await getConnection();
        try {
            await beginTransaction(connection);

            const existing = await this.findByClientRequest(
                data.worker_id,
                data.client_request_id,
                connection
            );
            if (existing) {
                await commit(connection);
                return {
                    id: existing.id,
                    duplicate: true,
                    duplicate_reason: "request_id",
                    existing_report: existing
                };
            }

            if (!data.force_create) {
                const similar = await this.findSimilarReport({
                    workerId: data.worker_id,
                    processId: data.process_id,
                    workDate: data.work_date,
                    shift: data.shift,
                    machineNo: data.machine_no,
                    productName: data.product_name
                }, connection);

                if (similar) {
                    await commit(connection);
                    return {
                        id: similar.id,
                        duplicate: true,
                        duplicate_reason: "similar_report",
                        existing_report: similar
                    };
                }

                const recent = await this.findRecentIdentical(data, connection);
                if (recent) {
                    await commit(connection);
                    return {
                        id: recent.id,
                        duplicate: true,
                        duplicate_reason: "rapid_repeat",
                        existing_report: recent
                    };
                }
            }

            const auditUserId = Number(audit?.userId || 0);
            if (!Number.isInteger(auditUserId) || auditUserId <= 0) {
                const auditError = new Error("Không xác định được người tạo báo cáo để ghi audit");
                auditError.code = "REPORT_AUDIT_ACTOR_REQUIRED";
                throw auditError;
            }

            const tempId = await this.create(data, connection);

            // Dùng cùng một connection cho toàn bộ dữ liệu con. Không commit bất kỳ
            // phần nào nếu NG, thời gian trừ, machine line hoặc audit bị lỗi.
            await this.createDefects(tempId, data.process_id, defects, connection);
            await this.createDeductions(tempId, data.process_id, deductions, connection);
            await this.replaceMachineLines(tempId, machineLines, connection);

            {
                await this.logAction({
                    reportType: "temp",
                    reportId: tempId,
                    userId: auditUserId,
                    action: "CREATE",
                    note: audit.note || "Công nhân tạo báo cáo",
                    ipAddress: audit.ipAddress || null,
                    userAgent: audit.userAgent || null
                }, connection);

                await query(
                    connection,
                    `INSERT INTO activity_logs
                     (user_id, action, entity_type, entity_id, description, metadata_json, ip_address, user_agent)
                     VALUES (?, 'CREATE_REPORT', 'temp_report', ?, ?, ?, ?, ?)`,
                    [
                        auditUserId,
                        String(tempId),
                        audit.description || `Tạo báo cáo chờ duyệt #${tempId}`,
                        JSON.stringify({
                            report_id: tempId,
                            worker_id: data.worker_id,
                            process_id: data.process_id,
                            work_date: data.work_date,
                            shift: data.shift,
                            machine_no: data.machine_no || null,
                            product_name: data.product_name || null,
                            tt_ok: Number(data.tt_ok || 0),
                            tt_ng: Number(data.tt_ng || 0),
                            client_request_id: data.client_request_id || null
                        }),
                        audit.ipAddress || null,
                        audit.userAgent || null
                    ]
                );
            }

            await commit(connection);
            return {
                id: tempId,
                duplicate: false,
                duplicate_reason: null,
                existing_report: null
            };
        } catch (error) {
            await rollback(connection);
            if (error.code === "ER_DUP_ENTRY" && data.client_request_id) {
                const existing = await this.findByClientRequest(
                    data.worker_id,
                    data.client_request_id
                );
                if (existing) {
                    return {
                        id: existing.id,
                        duplicate: true,
                        duplicate_reason: "request_id",
                        existing_report: existing
                    };
                }
            }
            throw error;
        } finally {
            connection.release();
        }
    }
};
