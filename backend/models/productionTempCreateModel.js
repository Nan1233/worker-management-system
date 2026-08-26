const crypto = require("node:crypto");
const db = require("../config/db");
const AuditService = require("../services/auditService");
const { query, getConnection, beginTransaction, commit, rollback } = require("./productionTempModelShared");
const { resolveInitialTrainingSnapshot } = require("../services/trainingSnapshotService");
const { validateMachineWorkerCapacityLocked } = require("../services/factoryMachineRuleService");
const { buildLogicalDuplicateKey } = require("../services/logicalDuplicateReportService");
const { verifyDuplicateConfirmation } = require("../services/duplicateConfirmationService");

module.exports = {
    async create(data, executor = db) {
        const trainingSnapshot = await resolveInitialTrainingSnapshot({
            workerId: data.worker_id,
            executor
        });

        const sql = `
            INSERT INTO production_reports_temp
            (
                worker_id, process_id, work_date, entry_date, shift,
                operation_type, operation_mode, machine_no,
                product_name, total_time, actual_time, deduction_time,
                standard_output, standard_version_id, machine_standard_id, training_percent_snapshot, exclude_kqd_from_tt_snapshot, actual_output, tt_ok, tt_ng, note, extra_data,
                client_request_id, logical_duplicate_key, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
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
            Number(data.standard_version_id) || null,
            Number(data.machine_standard_id) || null,
            trainingSnapshot,
            data.exclude_kqd_from_tt_snapshot === null || data.exclude_kqd_from_tt_snapshot === undefined ? null : (Number(data.exclude_kqd_from_tt_snapshot) === 1 ? 1 : 0),
            Number(data.actual_output) || 0,
            Number(data.tt_ok) || 0,
            Number(data.tt_ng) || 0,
            data.note || "",
            JSON.stringify(data.extra_data || {}),
            data.client_request_id || null,
            data.logical_duplicate_key || null
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

    async findSimilarTempReport({ workerId, processId, workDate, shift, machineNo, productName, logicalDuplicateKey = null }, executor = db) {
        const params = [workerId, processId, workDate, shift];
        let identitySql;
        if (logicalDuplicateKey) {
            identitySql = `((t.logical_duplicate_key = ?) OR (t.logical_duplicate_key IS NULL AND t.machine_no <=> ? AND t.product_name <=> ?))`;
            params.push(logicalDuplicateKey, machineNo, productName);
        } else {
            identitySql = `(t.machine_no <=> ? AND t.product_name <=> ?)`;
            params.push(machineNo, productName);
        }
        const rows = await query(
            executor,
            `SELECT t.id, t.status, t.work_date, t.shift, t.machine_no, t.product_name, t.logical_duplicate_key, t.created_at, t.updated_at,
                    CASE WHEN t.status='approved' THEN 'approved' ELSE 'temp' END AS report_type
             FROM production_reports_temp t
             WHERE t.worker_id = ?
               AND t.process_id = ?
               AND t.work_date = ?
               AND t.shift = ?
               AND ${identitySql}
               AND (
                    t.status IN ('pending', 'need_fix')
                    OR (t.status='approved' AND EXISTS (
                        SELECT 1 FROM production_reports a
                        WHERE a.source_temp_id=t.id AND a.status <> 'deleted'
                    ))
               )
             ORDER BY t.created_at DESC, t.id DESC
             LIMIT 1`,
            params
        );
        return rows[0] || null;
    },

    async findSimilarApprovedReport({ workerId, processId, workDate, shift, logicalDuplicateKey }, executor = db) {
        if (!logicalDuplicateKey) return null;
        const rows = await query(executor,
            `SELECT id, worker_id, process_id, work_date, shift, operation_mode, machine_no, product_name, status, created_at, updated_at
             FROM production_reports
             WHERE worker_id=? AND process_id=? AND work_date=? AND shift=? AND status <> 'deleted'
             ORDER BY id DESC
             FOR UPDATE`,
            [workerId, processId, workDate, shift]
        );
        if (!rows.length) return null;
        const ids = rows.map((row) => Number(row.id)).filter(Boolean);
        const placeholders = ids.map(() => '?').join(',');
        const machineRows = ids.length ? await query(executor,
            `SELECT report_id,machine_code,product_code,sort_order,id
             FROM production_report_machine_lines
             WHERE report_id IN (${placeholders})
             ORDER BY report_id,sort_order,id
             FOR UPDATE`, ids) : [];
        const byReport = new Map();
        for (const line of machineRows) {
            const reportId = Number(line.report_id);
            if (!byReport.has(reportId)) byReport.set(reportId, []);
            byReport.get(reportId).push(line);
        }
        for (const row of rows) {
            const key = buildLogicalDuplicateKey({
                workerId: row.worker_id,
                processId: row.process_id,
                workDate: row.work_date,
                shift: row.shift,
                operationMode: row.operation_mode,
                machineNo: row.machine_no,
                productName: row.product_name,
                machineLines: byReport.get(Number(row.id)) || [],
            });
            if (key === logicalDuplicateKey) return { ...row, report_type: 'approved' };
        }
        return null;
    },

    async findSimilarReport(input, executor = db) {
        const temp = await this.findSimilarTempReport(input, executor);
        if (temp) return temp;
        return this.findSimilarApprovedReport(input, executor);
    },


    async lockClientRequestId(workerId, clientRequestId, executor = db) {
        const worker = Number(workerId);
        const requestId = String(clientRequestId || "").trim();
        if (!Number.isInteger(worker) || worker <= 0 || !requestId) return;

        const logicalLockKey = crypto
            .createHash("sha256")
            .update(`client-request:${worker}:${requestId}`, "utf8")
            .digest("hex");

        await query(
            executor,
            `INSERT INTO production_report_duplicate_locks (logical_key, last_used_at)
             VALUES (?, NOW())
             ON DUPLICATE KEY UPDATE last_used_at = last_used_at`,
            [logicalLockKey]
        );
        await query(
            executor,
            `SELECT logical_key
             FROM production_report_duplicate_locks
             WHERE logical_key = ?
             FOR UPDATE`,
            [logicalLockKey]
        );
    },

    async lockLogicalDuplicateKey(logicalDuplicateKey, executor = db) {
        if (!logicalDuplicateKey) return;
        await query(
            executor,
            `INSERT INTO production_report_duplicate_locks (logical_key, last_used_at)
             VALUES (?, NOW())
             ON DUPLICATE KEY UPDATE last_used_at = last_used_at`,
            [logicalDuplicateKey]
        );
        await query(
            executor,
            `SELECT logical_key FROM production_report_duplicate_locks WHERE logical_key = ? FOR UPDATE`,
            [logicalDuplicateKey]
        );
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
        const validItems = defects.map((item) => ({ defectTypeId: Number(item.defect_type_id) || null, defectName: String(item.defect_name || "").trim(), quantity: Number(item.quantity) || 0 })).filter((item) => item.quantity > 0);
        if (!validItems.length) return;
        const unresolvedNames = [...new Set(validItems.filter((item) => !item.defectTypeId && item.defectName).map((item) => item.defectName))];
        const nameToId = new Map();
        if (unresolvedNames.length) {
            const placeholders = unresolvedNames.map(() => "?").join(",");
            const rows = await query(executor, `SELECT id, defect_name FROM defect_types WHERE process_id = ? AND status = 'active' AND defect_name IN (${placeholders})`, [processId, ...unresolvedNames]);
            rows.forEach((row) => nameToId.set(String(row.defect_name), Number(row.id)));
        }
        const defectTotals = new Map();
        for (const item of validItems) {
            const defectTypeId = item.defectTypeId || nameToId.get(item.defectName) || null;
            if (!defectTypeId) continue;
            defectTotals.set(defectTypeId, (defectTotals.get(defectTypeId) || 0) + item.quantity);
        }
        const values = [...defectTotals.entries()].filter(([, quantity]) => quantity > 0).map(([defectTypeId, quantity]) => [tempReportId, defectTypeId, Math.trunc(quantity)]);
        if (!values.length) return;
        const placeholders = values.map(() => "(?, ?, ?)").join(",");
        await query(executor, `INSERT INTO production_temp_defects (temp_report_id, defect_type_id, quantity) VALUES ${placeholders}`, values.flat());
    },

    async createDeductions(tempReportId, processId, deductions, executor = db) {
        if (!Array.isArray(deductions) || deductions.length === 0) return;
        const validItems = deductions.map((item) => ({ deductionTypeId: Number(item.deduction_type_id) || null, deductionName: String(item.deduction_name || "").trim(), hours: Number(item.hours) || 0 })).filter((item) => item.hours > 0);
        if (!validItems.length) return;
        const unresolvedNames = [...new Set(validItems.filter((item) => !item.deductionTypeId && item.deductionName).map((item) => item.deductionName))];
        const nameToId = new Map();
        if (unresolvedNames.length) {
            const placeholders = unresolvedNames.map(() => "?").join(",");
            const rows = await query(executor, `SELECT id, deduction_name FROM deduction_types WHERE process_id = ? AND status = 'active' AND deduction_name IN (${placeholders})`, [processId, ...unresolvedNames]);
            rows.forEach((row) => nameToId.set(String(row.deduction_name), Number(row.id)));
        }
        const deductionTotals = new Map();
        for (const item of validItems) {
            const deductionTypeId = item.deductionTypeId || nameToId.get(item.deductionName) || null;
            if (!deductionTypeId) continue;
            deductionTotals.set(deductionTypeId, (deductionTotals.get(deductionTypeId) || 0) + item.hours);
        }
        const values = [...deductionTotals.entries()].filter(([, hours]) => hours > 0).map(([deductionTypeId, hours]) => [tempReportId, deductionTypeId, hours]);
        if (!values.length) return;
        const placeholders = values.map(() => "(?, ?, ?)").join(",");
        await query(executor, `INSERT INTO production_temp_deductions (temp_report_id, deduction_type_id, hours) VALUES ${placeholders}`, values.flat());
    },

    async logAction({ reportType = "temp", reportId, userId, action, note = null, ipAddress = null, userAgent = null }, executor = db) {
        if (!reportId || !userId || !action) return;
        await query(executor, `INSERT INTO report_action_logs (report_type, report_id, user_id, action, note, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)`, [reportType, reportId, userId, action, note, ipAddress, userAgent]);
    },

    async replaceMachineLines(tempReportId, machineLines = [], executor = db, options = {}) {
        const oldLines = await query(executor, `SELECT id, machine_event_id, machine_code, product_code FROM production_temp_machine_lines WHERE temp_report_id = ?`, [tempReportId]);
        if (oldLines.length) {
            const ids = oldLines.map((row) => Number(row.id)).filter(Boolean);
            if (ids.length) await query(executor, `DELETE FROM production_temp_machine_defects WHERE machine_line_id IN (${ids.map(() => "?").join(",")})`, ids);
        }
        await query(executor, `DELETE FROM production_temp_machine_lines WHERE temp_report_id = ?`, [tempReportId]);
        if (!Array.isArray(machineLines) || machineLines.length === 0) return;
        for (let index = 0; index < Math.min(machineLines.length, 4); index += 1) {
            const line = machineLines[index] || {};
            const requestedEventId = line.machine_event_id || null;
            const normalizedRequestedEventId = Number(requestedEventId) || null;
            const preservedEventId = normalizedRequestedEventId || (options.preserveEventLinks ? Number((oldLines || []).find((old) => String(old.machine_code || '').trim().toUpperCase() === String(line.machine_code || '').trim().toUpperCase() && String(old.product_code || '').trim() === String(line.product_code || '').trim())?.machine_event_id || 0) || null : null);
            const result = await query(executor, `INSERT INTO production_temp_machine_lines
                (temp_report_id, machine_event_id, machine_id, machine_code, product_standard_id, standard_version_id, machine_standard_id, product_code,
                 machine_time_hours, standard_output, standard_time_seconds, standard_source, exclude_kqd_from_tt,
                 ok_quantity, ng_quantity, maximum_output, counted_output, earned_standard_hours,
                 defects_json, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                tempReportId, preservedEventId, Number(line.machine_id) || null, line.machine_code || null, Number(line.product_standard_id) || null,
                Number(line.standard_version_id) || null, Number(line.machine_standard_id) || null, line.product_code || null, Number(line.machine_time_hours) || 0,
                Number(line.standard_output) || 0, Number(line.standard_time_seconds) || 0, line.standard_source || null, line.exclude_kqd_from_tt === null || line.exclude_kqd_from_tt === undefined ? null : (Number(line.exclude_kqd_from_tt) === 1 ? 1 : 0),
                Number(line.ok_quantity) || 0, Number(line.ng_quantity) || 0, Number(line.maximum_output) || 0, Number(line.counted_output) || 0, Number(line.earned_standard_hours) || 0,
                JSON.stringify(line.defects_json || line.defects || []), index + 1
            ]);
            const machineLineId = Number(result.insertId);
            const defects = Array.isArray(line.defects) ? line.defects : [];
            if (machineLineId && defects.length) {
                const validDefects = defects.map((item) => [machineLineId, Number(item.defect_type_id) || null, Number(item.quantity) || 0]).filter(([, defectTypeId, quantity]) => defectTypeId && quantity > 0);
                if (validDefects.length) await query(executor, `INSERT INTO production_temp_machine_defects (machine_line_id, defect_type_id, quantity) VALUES ${validDefects.map(() => '(?, ?, ?)').join(',')}`, validDefects.flat());
            }
        }
    }
};
