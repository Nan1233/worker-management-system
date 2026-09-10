const db = require("../config/db");
const createModel = require("./productionTempCreateModel");
const nonProductWorkModel = require("./nonProductWorkCreateModel");
const readModel = require("./productionTempReadModel");
const reviewModel = require("./productionTempReviewModel");
const historyModel = require("./productionTempHistoryModel");
const AuditService = require("../services/auditService");
const { query, getConnection, beginTransaction, commit, rollback } = require("./productionTempModelShared");
const { resolveInitialTrainingSnapshot } = require("../services/trainingSnapshotService");
const { validateMachineWorkerCapacityLocked } = require("../services/factoryMachineRuleService");
const { buildLogicalDuplicateKey } = require("../services/logicalDuplicateReportService");
const { verifyDuplicateConfirmation } = require("../services/duplicateConfirmationService");

const DAILY_HOURS_LIMIT = 12;
const submissionQueues = new Map();

const runSerialized = async (key, task) => {
    const previous = submissionQueues.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    submissionQueues.set(key, current);
    await previous;
    try { return await task(); }
    finally {
        release();
        if (submissionQueues.get(key) === current) submissionQueues.delete(key);
    }
};

const queueKey = (data, machineLines = []) => {
    const workerId = Number(data?.worker_id || data?.workerId || 0);
    const client = String(data?.client_request_id || "").trim();
    if (client) return `client:${workerId}:${client}`;
    const logical = String(data?.logical_duplicate_key || "").trim();
    if (logical) return `logical:${workerId}:${logical}`;
    const machines = [...new Set((Array.isArray(machineLines) ? machineLines : [])
        .map((x) => String(x?.machine_code || "").trim().toUpperCase()).filter(Boolean))].sort().join(",");
    return `capacity:${workerId}:${Number(data?.process_id || 0)}:${String(data?.work_date || "").slice(0,10)}:${String(data?.shift || "").trim().toUpperCase()}:${machines}`;
};

const findExistingClientRequest = async (data, executor = db) => {
    const workerId = Number(data?.worker_id);
    const requestId = String(data?.client_request_id || "").trim();
    if (!Number.isInteger(workerId) || workerId <= 0 || !requestId) return null;
    const rows = await query(executor,
        `SELECT id, status FROM production_reports_temp WHERE worker_id=? AND client_request_id=? LIMIT 1`,
        [workerId, requestId]);
    return rows?.[0] || null;
};

const idempotent = (row) => ({ id: Number(row.id), duplicate: true, duplicate_reason: "request_id", existing_report: row });

const is1205 = (error) => {
    const message = String(error?.message || "").toLowerCase();
    return Number(error?.errno) === 1205 || message.includes("lock wait timeout exceeded") || message.includes("error 1205");
};

const recoverAfter1205 = async (data) => {
    // The failed transaction has already been rolled back by createModel.
    // Only perform short read-only checks here; never retry the INSERT.
    for (const delay of [0, 150, 500, 1000]) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const existing = await findExistingClientRequest(data);
        if (existing) return idempotent(existing);
    }
    const error = new Error("Yêu cầu gửi báo cáo đang bị một yêu cầu khác xử lý. Vui lòng bấm gửi lại.");
    error.status = 409;
    error.code = "PRODUCTION_SUBMISSION_CONFLICT";
    error.isPublic = true;
    throw error;
};

const enforceDailyWorkerHours = async (data, executor = db) => {
    const workerId = Number(data?.worker_id);
    const workDate = String(data?.work_date || "").slice(0, 10);
    const incoming = Number(data?.actual_time) || 0;
    if (!Number.isInteger(workerId) || workerId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return null;
    const rows = await query(executor, `
        SELECT COALESCE(SUM(actual_time),0) AS counted_hours FROM production_reports
        WHERE worker_id=? AND work_date=? AND status='approved'
        UNION ALL
        SELECT COALESCE(SUM(actual_time),0) AS counted_hours FROM production_reports_temp
        WHERE worker_id=? AND work_date=? AND status IN ('pending','need_fix')`,
        [workerId, workDate, workerId, workDate]);
    const existing = (rows || []).reduce((sum, row) => sum + Number(row?.counted_hours || 0), 0);
    const projected = existing + incoming;
    if (projected > DAILY_HOURS_LIMIT + 0.000001) {
        const error = new Error(`Tổng giờ làm trong ngày không được vượt quá 12 giờ. Hiện đã có ${existing.toFixed(2)} giờ, báo cáo này thêm ${incoming.toFixed(2)} giờ.`);
        error.status = 422;
        error.code = "DAILY_WORKING_HOURS_LIMIT_EXCEEDED";
        error.isPublic = true;
        throw error;
    }
    return { existingHours: existing, incomingActualHours: incoming, projectedHours: projected, limitHours: DAILY_HOURS_LIMIT };
};

// Never use the old FOR UPDATE approved lookup on Cloudflare. It can hold
// unrelated production rows while another worker is trying to create a temp report.
createModel.findSimilarApprovedReport = async ({ workerId, processId, workDate, shift, logicalDuplicateKey }, executor = db) => {
    if (!logicalDuplicateKey) return null;
    const rows = await query(executor,
        `SELECT id, worker_id, process_id, work_date, shift, operation_mode, machine_no, product_name, status, created_at, updated_at
         FROM production_reports
         WHERE worker_id=? AND process_id=? AND work_date=? AND shift=? AND status <> 'deleted'
         ORDER BY id DESC`,
        [workerId, processId, workDate, shift]);
    if (!rows.length) return null;
    const ids = rows.map((r) => Number(r.id)).filter(Boolean);
    const machineRows = await query(executor,
        `SELECT report_id,machine_code,product_code,sort_order,id FROM production_report_machine_lines
         WHERE report_id IN (${ids.map(() => '?').join(',')}) ORDER BY report_id,sort_order,id`, ids);
    const byReport = new Map();
    for (const line of machineRows) {
        const id = Number(line.report_id);
        if (!byReport.has(id)) byReport.set(id, []);
        byReport.get(id).push(line);
    }
    for (const row of rows) {
        const key = buildLogicalDuplicateKey({
            workerId: row.worker_id, processId: row.process_id, workDate: row.work_date,
            shift: row.shift, operationMode: row.operation_mode, machineNo: row.machine_no,
            productName: row.product_name, machineLines: byReport.get(Number(row.id)) || []
        });
        if (key === logicalDuplicateKey) return { ...row, report_type: 'approved' };
    }
    return null;
};

/*
 * IMPORTANT concurrency design:
 *
 * The parent production_reports_temp INSERT is committed in its own very short
 * transaction. This releases the unique client_request_id index lock before
 * machine lines, defects, deductions and audit work begins. Previously the
 * parent INSERT and all those operations shared one long transaction, so a
 * second request for the same client_request_id could sit on the unique index
 * until TiDB returned Error 1205.
 *
 * The second transaction owns only the child/audit work. If that phase fails,
 * we mark the report as need_fix rather than leaving the request hanging or
 * pretending that the network is offline.
 */
const createCompleteReport = async (payload = {}, legacyDefects, legacyDeductions, legacyMachineLines, legacyAudit) => {
    const wrapped = payload && typeof payload === "object" && payload.data && typeof payload.data === "object";
    const raw = wrapped ? payload.data : payload;
    const data = { ...(raw || {}), worker_id: raw?.worker_id ?? raw?.workerId ?? null };
    const defects = wrapped ? (Array.isArray(payload.defects) ? payload.defects : []) : (Array.isArray(legacyDefects) ? legacyDefects : []);
    const deductions = wrapped ? (Array.isArray(payload.deductions) ? payload.deductions : []) : (Array.isArray(legacyDeductions) ? legacyDeductions : []);
    const machineLines = wrapped ? (Array.isArray(payload.machineLines) ? payload.machineLines : []) : (Array.isArray(legacyMachineLines) ? legacyMachineLines : []);
    const audit = wrapped ? (payload.audit || {}) : (legacyAudit || {});

    const workerId = Number(data.worker_id);
    if (!Number.isInteger(workerId) || workerId <= 0) {
        const error = new Error("Không xác định được nhân viên để tạo báo cáo");
        error.status = 422; error.code = "TRAINING_SNAPSHOT_WORKER_REQUIRED"; error.isPublic = true; throw error;
    }
    const requestId = String(data.client_request_id || "").trim();
    if (!requestId) {
        const error = new Error("Thiếu mã yêu cầu gửi báo cáo");
        error.status = 400; error.code = "CLIENT_REQUEST_ID_REQUIRED"; error.isPublic = true; throw error;
    }

    // Idempotency MUST be checked before the 12-hour calculation. A retry of
    // an already-created request must return the existing report instead of
    // counting that same report again and incorrectly returning HTTP 422.
    const existingRequest = await findExistingClientRequest(data);
    if (existingRequest) return idempotent(existingRequest);

    const processCode = String(data.process_code || data.extra_data?.process_code || "").trim().toUpperCase();
    const isCVK = Number(data.process_id) === 60006 || processCode === "CVK";
    if (isCVK) {
        data.process_id = 60006; data.process_code = "CVK";
        await enforceDailyWorkerHours(data);
        return nonProductWorkModel.createCompleteReport({ data, defects, deductions, audit });
    }

    await enforceDailyWorkerHours(data);
    const key = queueKey(data, machineLines);

    return runSerialized(key, async () => {
        const existingBefore = await findExistingClientRequest(data);
        if (existingBefore) return idempotent(existingBefore);

        data.logical_duplicate_key = buildLogicalDuplicateKey({
            workerId: data.worker_id, processId: data.process_id, workDate: data.work_date,
            shift: data.shift, operationMode: data.operation_mode ?? data.operationMode,
            machineNo: data.machine_no, productName: data.product_name, machineLines
        });

        // Duplicate confirmation is read-only and happens before the short INSERT transaction.
        const tempDuplicate = await createModel.findSimilarTempReport({
            workerId: data.worker_id, processId: data.process_id, workDate: data.work_date,
            shift: data.shift, machineNo: data.machine_no, productName: data.product_name,
            logicalDuplicateKey: data.logical_duplicate_key
        });
        const approvedDuplicate = tempDuplicate ? null : await createModel.findSimilarApprovedReport({
            workerId: data.worker_id, processId: data.process_id, workDate: data.work_date,
            shift: data.shift, logicalDuplicateKey: data.logical_duplicate_key
        });
        const existingDuplicate = tempDuplicate || approvedDuplicate;
        if (existingDuplicate) {
            if (!data.force_create) {
                const error = new Error("Báo cáo trùng với báo cáo đã tồn tại trong cùng ngày/ca");
                error.status = 409; error.code = "DUPLICATE_CONFIRMATION_REQUIRED"; error.isPublic = true;
                error.existing_report = existingDuplicate; error.details = existingDuplicate; throw error;
            }
            const confirmation = verifyDuplicateConfirmation(data.duplicate_confirmation_token, {
                workerId: data.worker_id, logicalDuplicateKey: data.logical_duplicate_key,
                existingReportId: existingDuplicate.id, existingReportType: existingDuplicate.report_type || "temp"
            });
            if (!confirmation.valid) {
                const error = new Error("Xác nhận tạo báo cáo trùng không hợp lệ hoặc đã hết hạn");
                error.status = 409; error.code = "DUPLICATE_CONFIRMATION_REQUIRED"; error.isPublic = true;
                error.existing_report = existingDuplicate; throw error;
            }
        } else if (data.force_create) {
            const error = new Error("Không có báo cáo trùng hợp lệ để xác nhận tạo lần thứ hai");
            error.status = 409; error.code = "DUPLICATE_CONFIRMATION_REQUIRED"; error.isPublic = true; throw error;
        }

        // All expensive validation is outside the parent INSERT transaction.
        const processRows = await query(db, `SELECT process_code FROM processes WHERE id=? LIMIT 1`, [Number(data.process_id)]);
        const training = await resolveInitialTrainingSnapshot({
            executor: db, workerId: data.worker_id, processId: data.process_id,
            workDate: data.work_date, trainingPercent: data.training_percent
        });
        data.training_percent_snapshot = training.training_percent;
        data.standard_version_id = data.standard_version_id || null;
        data.machine_standard_id = data.machine_standard_id || null;
        data.exclude_kqd_from_tt_snapshot = data.exclude_kqd_from_tt_snapshot ?? data.exclude_kqd_from_tt ?? null;

        if (machineLines.length) {
            const capacity = await validateMachineWorkerCapacityLocked({
                executor: db, processCode: processRows[0]?.process_code, processId: data.process_id,
                machineLines, workerId: data.worker_id, workDate: data.work_date, shift: data.shift
            });
            if (!capacity.valid) {
                const error = new Error("Số công nhân trên máy vượt giới hạn trong cùng ngày/ca");
                error.status = 422; error.code = "MACHINE_WORKER_LIMIT_EXCEEDED"; error.isPublic = true; error.details = capacity.errors; throw error;
            }
        }

        const auditUserId = Number(audit?.userId || 0);
        if (!Number.isInteger(auditUserId) || auditUserId <= 0) {
            const error = new Error("Không xác định được người tạo báo cáo để ghi audit");
            error.code = "REPORT_AUDIT_ACTOR_REQUIRED"; throw error;
        }

        // PHASE 1: atomic parent insert only. The unique index lock exists for
        // milliseconds instead of covering all child/audit queries.
        let tempId;
        const parentConnection = await getConnection();
        try {
            await beginTransaction(parentConnection);
            const race = await findExistingClientRequest(data, parentConnection);
            if (race) {
                await commit(parentConnection);
                return idempotent(race);
            }
            try {
                tempId = await createModel.create(data, parentConnection);
            } catch (error) {
                await rollback(parentConnection);
                if (error?.code === "ER_DUP_ENTRY") {
                    const existing = await findExistingClientRequest(data);
                    if (existing) return idempotent(existing);
                }
                throw error;
            }
            await commit(parentConnection);
        } finally {
            parentConnection.release();
        }

        // PHASE 2: child data + audit. No unique client-request lock is held now.
        const childConnection = await getConnection();
        try {
            await beginTransaction(childConnection);
            await createModel.createDefects(tempId, data.process_id, defects, childConnection);
            await createModel.createDeductions(tempId, data.process_id, deductions, childConnection);
            await createModel.replaceMachineLines(tempId, machineLines, childConnection);

            const snapshot = await AuditService.loadTempReportSnapshot(tempId, childConnection);
            if (snapshot) {
                await AuditService.createReportVersion({
                    reportType: "temp", reportId: tempId, snapshot,
                    reason: "Tạo báo cáo chờ duyệt", userId: auditUserId
                }, childConnection);
            }
            await createModel.logAction({
                reportType: "temp", reportId: tempId, userId: auditUserId, action: "CREATE",
                note: audit.note || "Công nhân tạo báo cáo", ipAddress: audit.ipAddress || null,
                userAgent: audit.userAgent || null
            }, childConnection);
            await query(childConnection,
                `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, metadata_json, ip_address, user_agent)
                 VALUES (?, 'CREATE_REPORT', 'temp_report', ?, ?, ?, ?, ?)`,
                [auditUserId, String(tempId), "Công nhân tạo báo cáo chờ duyệt",
                    JSON.stringify({ processId: data.process_id, workDate: data.work_date, shift: data.shift, clientRequestId: requestId, logicalDuplicateKey: data.logical_duplicate_key }),
                    audit.ipAddress || null, audit.userAgent || null]);
            await commit(childConnection);
        } catch (error) {
            await rollback(childConnection);
            // Parent is already committed intentionally. Keep it visible as
            // need_fix so the report is recoverable instead of returning 500
            // after a successful parent creation.
            try {
                await query(childConnection, `UPDATE production_reports_temp SET status='need_fix' WHERE id=?`, [tempId]);
            } catch {}
            throw error;
        } finally {
            childConnection.release();
        }

        return { id: Number(tempId), duplicate: false, duplicate_reason: null, existing_report: null, logical_duplicate_key: data.logical_duplicate_key };
    });
};

module.exports = { ...createModel, createCompleteReport, ...readModel, ...reviewModel, ...historyModel, enforceDailyWorkerHours };
