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

const idempotent = (row) => ({
    id: Number(row.id),
    duplicate: true,
    duplicate_reason: "request_id",
    existing_report: row
});

const is1205 = (error) => {
    const message = String(error?.message || "").toLowerCase();
    return Number(error?.errno) === 1205 || message.includes("lock wait timeout exceeded") || message.includes("error 1205");
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const recoverAfter1205 = async (data) => {
    for (const delay of [0, 150, 500, 1000]) {
        if (delay) await sleep(delay);
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

// Cloudflare/TiDB: avoid long FOR UPDATE scans during temp submission.
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
    if (!ids.length) return null;
    const machineRows = await query(executor,
        `SELECT report_id,machine_code,product_code,sort_order,id
         FROM production_report_machine_lines
         WHERE report_id IN (${ids.map(() => '?').join(',')})
         ORDER BY report_id,sort_order,id`, ids);
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
        if (key === logicalDuplicateKey) return { ...row, report_type: "approved" };
    }
    return null;
};

const normalizeDefectsForPersistence = async (processId, defects, executor) => {
    const items = (Array.isArray(defects) ? defects : [])
        .map((item) => ({
            defectTypeId: Number(item?.defect_type_id || item?.id || 0) || null,
            defectCode: String(item?.defect_code || item?.defect_type_code || item?.code || "").trim(),
            defectName: String(item?.defect_name || item?.name || item?.label || "").trim(),
            quantity: Math.trunc(Number(item?.quantity ?? item?.qty ?? item?.ng_quantity ?? 0) || 0)
        }))
        .filter((item) => item.quantity > 0);
    if (!items.length) return [];

    const ids = [...new Set(items.map((x) => x.defectTypeId).filter(Boolean))];
    const codes = [...new Set(items.map((x) => x.defectCode).filter(Boolean))];
    const names = [...new Set(items.map((x) => x.defectName).filter(Boolean))];
    const clauses = [];
    const params = [Number(processId)];
    if (ids.length) { clauses.push(`id IN (${ids.map(() => "?").join(",")})`); params.push(...ids); }
    if (codes.length) { clauses.push(`defect_code IN (${codes.map(() => "?").join(",")})`); params.push(...codes); }
    if (names.length) { clauses.push(`defect_name IN (${names.map(() => "?").join(",")})`); params.push(...names); }

    const rows = clauses.length ? await query(executor,
        `SELECT id, defect_code, defect_name FROM defect_types
         WHERE process_id=? AND status='active' AND (${clauses.join(" OR ")})`, params) : [];
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    const byCode = new Map(rows.map((r) => [String(r.defect_code || "").trim().toUpperCase(), r]));
    const byName = new Map(rows.map((r) => [String(r.defect_name || "").trim(), r]));

    const resolved = [];
    for (const item of items) {
        const master = (item.defectTypeId && byId.get(item.defectTypeId))
            || (item.defectCode && byCode.get(item.defectCode.toUpperCase()))
            || (item.defectName && byName.get(item.defectName));
        if (!master) {
            const error = new Error(`Không xác định được loại lỗi NG: ${item.defectCode || item.defectName || item.defectTypeId}`);
            error.status = 422;
            error.code = "DEFECT_TYPE_NOT_FOUND";
            error.isPublic = true;
            error.details = { process_id: processId, item };
            throw error;
        }
        resolved.push({
            defect_type_id: Number(master.id),
            defect_code: String(master.defect_code || ""),
            defect_name: String(master.defect_name || ""),
            quantity: item.quantity
        });
    }

    const totals = new Map();
    for (const item of resolved) totals.set(item.defect_type_id, (totals.get(item.defect_type_id) || 0) + item.quantity);
    return [...totals.entries()].map(([defect_type_id, quantity]) => {
        const master = byId.get(defect_type_id);
        return { defect_type_id, defect_code: master?.defect_code || "", defect_name: master?.defect_name || "", quantity };
    });
};

const normalizeDeductionsForPersistence = async (processId, deductions, executor) => {
    const items = (Array.isArray(deductions) ? deductions : [])
        .map((item) => ({
            deductionTypeId: Number(item?.deduction_type_id || item?.id || 0) || null,
            deductionCode: String(item?.deduction_code || item?.code || "").trim(),
            deductionName: String(item?.deduction_name || item?.name || item?.label || "").trim(),
            hours: Number(item?.hours ?? item?.deduction_hours ?? 0) || 0
        }))
        .filter((item) => item.hours > 0);
    if (!items.length) return [];

    const ids = [...new Set(items.map((x) => x.deductionTypeId).filter(Boolean))];
    const codes = [...new Set(items.map((x) => x.deductionCode).filter(Boolean))];
    const names = [...new Set(items.map((x) => x.deductionName).filter(Boolean))];
    const clauses = [];
    const params = [Number(processId)];
    if (ids.length) { clauses.push(`id IN (${ids.map(() => "?").join(",")})`); params.push(...ids); }
    if (codes.length) { clauses.push(`deduction_code IN (${codes.map(() => "?").join(",")})`); params.push(...codes); }
    if (names.length) { clauses.push(`deduction_name IN (${names.map(() => "?").join(",")})`); params.push(...names); }

    const rows = clauses.length ? await query(executor,
        `SELECT id, deduction_code, deduction_name FROM deduction_types
         WHERE process_id=? AND status='active' AND (${clauses.join(" OR ")})`, params) : [];
    const byId = new Map(rows.map((r) => [Number(r.id), r]));
    const byCode = new Map(rows.map((r) => [String(r.deduction_code || "").trim().toUpperCase(), r]));
    const byName = new Map(rows.map((r) => [String(r.deduction_name || "").trim(), r]));

    const resolved = [];
    for (const item of items) {
        const master = (item.deductionTypeId && byId.get(item.deductionTypeId))
            || (item.deductionCode && byCode.get(item.deductionCode.toUpperCase()))
            || (item.deductionName && byName.get(item.deductionName));
        if (!master) {
            const error = new Error(`Không xác định được loại trừ giờ: ${item.deductionCode || item.deductionName || item.deductionTypeId}`);
            error.status = 422;
            error.code = "DEDUCTION_TYPE_NOT_FOUND";
            error.isPublic = true;
            error.details = { process_id: processId, item };
            throw error;
        }
        resolved.push({
            deduction_type_id: Number(master.id),
            deduction_code: String(master.deduction_code || ""),
            deduction_name: String(master.deduction_name || ""),
            hours: item.hours
        });
    }

    const totals = new Map();
    for (const item of resolved) totals.set(item.deduction_type_id, (totals.get(item.deduction_type_id) || 0) + item.hours);
    return [...totals.entries()].map(([deduction_type_id, hours]) => {
        const master = byId.get(deduction_type_id);
        return { deduction_type_id, deduction_code: master?.deduction_code || "", deduction_name: master?.deduction_name || "", hours };
    });
};

const validateChildTotals = (data, defects, deductions) => {
    const expectedNg = Math.max(0, Math.trunc(Number(data?.tt_ng || 0) || 0));
    const actualNg = defects.reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.quantity) || 0)), 0);
    if (expectedNg !== actualNg) {
        const error = new Error(`Chi tiết NG (${actualNg}) không khớp TT NG (${expectedNg})`);
        error.status = 422; error.code = "NG_DETAIL_TOTAL_MISMATCH"; error.isPublic = true;
        error.details = { expected: expectedNg, actual: actualNg }; throw error;
    }

    const expectedDeduction = Number(data?.deduction_time || 0) || 0;
    const actualDeduction = deductions.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
    if (Math.abs(expectedDeduction - actualDeduction) > 0.0002) {
        const error = new Error(`Chi tiết trừ giờ (${actualDeduction.toFixed(4)}) không khớp tổng trừ giờ (${expectedDeduction.toFixed(4)})`);
        error.status = 422; error.code = "DEDUCTION_DETAIL_TOTAL_MISMATCH"; error.isPublic = true;
        error.details = { expected: expectedDeduction, actual: actualDeduction }; throw error;
    }
};

const createAuditAfterChildren = async ({ tempId, audit, data, requestId, logicalDuplicateKey }) => {
    const connection = await getConnection();
    try {
        await beginTransaction(connection);
        const snapshot = await AuditService.loadTempReportSnapshot(tempId, connection);
        if (snapshot) {
            await AuditService.createReportVersion({
                reportType: "temp", reportId: tempId, snapshot,
                reason: "Tạo báo cáo chờ duyệt", userId: Number(audit?.userId || 0)
            }, connection);
        }
        await createModel.logAction({
            reportType: "temp", reportId: tempId, userId: Number(audit?.userId || 0), action: "CREATE",
            note: audit?.note || "Công nhân tạo báo cáo", ipAddress: audit?.ipAddress || null,
            userAgent: audit?.userAgent || null
        }, connection);
        await query(connection,
            `INSERT INTO activity_logs
             (user_id, action, entity_type, entity_id, description, metadata_json, ip_address, user_agent)
             VALUES (?, 'CREATE_REPORT', 'temp_report', ?, ?, ?, ?, ?)`,
            [Number(audit?.userId || 0), String(tempId), "Công nhân tạo báo cáo chờ duyệt",
                JSON.stringify({ processId: data.process_id, workDate: data.work_date, shift: data.shift, clientRequestId: requestId, logicalDuplicateKey }),
                audit?.ipAddress || null, audit?.userAgent || null]);
        await commit(connection);
    } catch (error) {
        await rollback(connection);
        throw error;
    } finally {
        connection.release();
    }
};

const createCompleteReport = async (payload = {}, legacyDefects, legacyDeductions, legacyMachineLines, legacyAudit) => {
    const wrapped = payload && typeof payload === "object" && payload.data && typeof payload.data === "object";
    const raw = wrapped ? payload.data : payload;
    const data = { ...(raw || {}), worker_id: raw?.worker_id ?? raw?.workerId ?? null };
    const defectsInput = wrapped ? (Array.isArray(payload.defects) ? payload.defects : []) : (Array.isArray(legacyDefects) ? legacyDefects : []);
    const deductionsInput = wrapped ? (Array.isArray(payload.deductions) ? payload.deductions : []) : (Array.isArray(legacyDeductions) ? legacyDeductions : []);
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

    const existingRequest = await findExistingClientRequest(data);
    if (existingRequest) return idempotent(existingRequest);

    const processCode = String(data.process_code || data.extra_data?.process_code || "").trim().toUpperCase();
    const isCVK = Number(data.process_id) === 60006 || processCode === "CVK";
    if (isCVK) {
        data.process_id = 60006; data.process_code = "CVK";
        await enforceDailyWorkerHours(data);
        return nonProductWorkModel.createCompleteReport({ data, defects: defectsInput, deductions: deductionsInput, audit });
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
            error.status = 422; error.code = "REPORT_AUDIT_ACTOR_REQUIRED"; error.isPublic = true; throw error;
        }

        // Resolve master data BEFORE creating the parent. This prevents the old
        // failure mode where a parent report existed with only tt_ng/deduction_time
        // and the detail rows were silently dropped.
        const validationConnection = await getConnection();
        let defects;
        let deductions;
        try {
            await beginTransaction(validationConnection);
            defects = await normalizeDefectsForPersistence(data.process_id, defectsInput, validationConnection);
            deductions = await normalizeDeductionsForPersistence(data.process_id, deductionsInput, validationConnection);
            validateChildTotals(data, defects, deductions);
            await rollback(validationConnection);
        } catch (error) {
            try { await rollback(validationConnection); } catch {}
            throw error;
        } finally {
            validationConnection.release();
        }

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
                if (is1205(error)) return recoverAfter1205(data);
                throw error;
            }
            await commit(parentConnection);
        } finally {
            parentConnection.release();
        }

        // Child rows are committed independently from audit. A failure in audit
        // must never erase NG/deduction/machine details that were already saved.
        const childConnection = await getConnection();
        try {
            await beginTransaction(childConnection);
            await createModel.createDefects(tempId, data.process_id, defects, childConnection);
            await createModel.createDeductions(tempId, data.process_id, deductions, childConnection);
            await createModel.replaceMachineLines(tempId, machineLines, childConnection);
            await commit(childConnection);
        } catch (error) {
            await rollback(childConnection);
            try {
                await query(db, `UPDATE production_reports_temp SET status='need_fix', review_note=? WHERE id=?`,
                    [`Không thể lưu chi tiết báo cáo: ${String(error?.message || error).slice(0, 450)}`, tempId]);
            } catch {}
            if (is1205(error)) return recoverAfter1205(data);
            const wrappedError = new Error(`Không thể lưu chi tiết báo cáo: ${String(error?.message || error)}`);
            wrappedError.status = Number(error?.status) >= 400 ? Number(error.status) : 422;
            wrappedError.code = error?.code || "REPORT_DETAIL_PERSIST_FAILED";
            wrappedError.isPublic = true;
            wrappedError.details = error?.details || { temp_report_id: tempId };
            throw wrappedError;
        } finally {
            childConnection.release();
        }

        let auditWarning = null;
        try {
            await createAuditAfterChildren({ tempId, audit, data, requestId, logicalDuplicateKey: data.logical_duplicate_key });
        } catch (error) {
            auditWarning = String(error?.message || error).slice(0, 450);
            try {
                await query(db, `UPDATE production_reports_temp SET review_note=? WHERE id=?`,
                    [`Audit chưa hoàn tất: ${auditWarning}`, tempId]);
            } catch {}
        }

        return {
            id: Number(tempId),
            duplicate: false,
            duplicate_reason: null,
            existing_report: null,
            logical_duplicate_key: data.logical_duplicate_key,
            audit_warning: auditWarning
        };
    });
};

module.exports = {
    ...createModel,
    createCompleteReport,
    ...readModel,
    ...reviewModel,
    ...historyModel,
    enforceDailyWorkerHours
};
