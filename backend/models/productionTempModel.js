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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
const is1205 = (error) => Number(error?.errno) === 1205 || /lock wait timeout exceeded|error 1205/i.test(String(error?.message || ""));

const recoverAfter1205 = async (data) => {
    for (const delay of [0, 150, 500, 1000]) {
        if (delay) await sleep(delay);
        const existing = await findExistingClientRequest(data);
        if (existing) return idempotent(existing);
    }
    const error = new Error("Yêu cầu gửi báo cáo đang bị một yêu cầu khác xử lý. Vui lòng bấm gửi lại.");
    error.status = 409; error.code = "PRODUCTION_SUBMISSION_CONFLICT"; error.isPublic = true;
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
    if (existing + incoming > DAILY_HOURS_LIMIT + 0.000001) {
        const error = new Error(`Tổng giờ làm trong ngày không được vượt quá 12 giờ. Hiện đã có ${existing.toFixed(2)} giờ, báo cáo này thêm ${incoming.toFixed(2)} giờ.`);
        error.status = 422; error.code = "DAILY_WORKING_HOURS_LIMIT_EXCEEDED"; error.isPublic = true; throw error;
    }
    return { existingHours: existing, incomingActualHours: incoming, projectedHours: existing + incoming, limitHours: DAILY_HOURS_LIMIT };
};

createModel.findSimilarApprovedReport = async ({ workerId, processId, workDate, shift, logicalDuplicateKey }, executor = db) => {
    if (!logicalDuplicateKey) return null;
    const rows = await query(executor,
        `SELECT id, worker_id, process_id, work_date, shift, operation_mode, machine_no, product_name, status, created_at, updated_at
         FROM production_reports WHERE worker_id=? AND process_id=? AND work_date=? AND shift=? AND status <> 'deleted' ORDER BY id DESC`,
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
        if (key === logicalDuplicateKey) return { ...row, report_type: "approved" };
    }
    return null;
};

const resolveMasterDetails = async (processId, defects, deductions, executor) => {
    const defectItems = (Array.isArray(defects) ? defects : []).map((item) => ({
        id: Number(item?.defect_type_id || item?.id || 0) || null,
        code: String(item?.defect_code || item?.defect_type_code || item?.code || "").trim(),
        name: String(item?.defect_name || item?.name || item?.label || "").trim(),
        quantity: Math.trunc(Number(item?.quantity ?? item?.qty ?? item?.ng_quantity ?? 0) || 0)
    })).filter((x) => x.quantity > 0);

    const deductionItems = (Array.isArray(deductions) ? deductions : []).map((item) => ({
        id: Number(item?.deduction_type_id || item?.id || 0) || null,
        code: String(item?.deduction_code || item?.code || "").trim(),
        name: String(item?.deduction_name || item?.name || item?.label || "").trim(),
        hours: Number(item?.hours ?? item?.deduction_hours ?? 0) || 0
    })).filter((x) => x.hours > 0);

    const resolve = async (table, items, label) => {
        if (!items.length) return [];
        const ids = [...new Set(items.map((x) => x.id).filter(Boolean))];
        const codes = [...new Set(items.map((x) => x.code).filter(Boolean))];
        const names = [...new Set(items.map((x) => x.name).filter(Boolean))];
        const clauses = [];
        const params = [Number(processId)];
        if (ids.length) { clauses.push(`id IN (${ids.map(() => "?").join(",")})`); params.push(...ids); }
        if (codes.length) { clauses.push(`${table === "defect_types" ? "defect_code" : "deduction_code"} IN (${codes.map(() => "?").join(",")})`); params.push(...codes); }
        if (names.length) { clauses.push(`${table === "defect_types" ? "defect_name" : "deduction_name"} IN (${names.map(() => "?").join(",")})`); params.push(...names); }
        const rows = await query(executor,
            `SELECT id, ${table === "defect_types" ? "defect_code, defect_name" : "deduction_code, deduction_name"}
             FROM ${table} WHERE process_id=? AND status='active' AND (${clauses.join(" OR ")})`, params);
        const byId = new Map(rows.map((r) => [Number(r.id), r]));
        const codeField = table === "defect_types" ? "defect_code" : "deduction_code";
        const nameField = table === "defect_types" ? "defect_name" : "deduction_name";
        const byCode = new Map(rows.map((r) => [String(r[codeField] || "").trim().toUpperCase(), r]));
        const byName = new Map(rows.map((r) => [String(r[nameField] || "").trim(), r]));
        return items.map((item) => {
            const master = (item.id && byId.get(item.id)) || (item.code && byCode.get(item.code.toUpperCase())) || (item.name && byName.get(item.name));
            if (!master) {
                const error = new Error(`Không xác định được ${label}: ${item.code || item.name || item.id}`);
                error.status = 422; error.code = label === "loại lỗi NG" ? "DEFECT_TYPE_NOT_FOUND" : "DEDUCTION_TYPE_NOT_FOUND";
                error.isPublic = true; error.details = { process_id: processId, item }; throw error;
            }
            if (table === "defect_types") return { defect_type_id: Number(master.id), defect_code: master.defect_code || "", defect_name: master.defect_name || "", quantity: item.quantity };
            return { deduction_type_id: Number(master.id), deduction_code: master.deduction_code || "", deduction_name: master.deduction_name || "", hours: item.hours };
        });
    };

    const resolvedDefects = await resolve("defect_types", defectItems, "loại lỗi NG");
    const resolvedDeductions = await resolve("deduction_types", deductionItems, "loại trừ giờ");
    const defectTotals = new Map();
    for (const item of resolvedDefects) defectTotals.set(item.defect_type_id, (defectTotals.get(item.defect_type_id) || 0) + item.quantity);
    const deductionTotals = new Map();
    for (const item of resolvedDeductions) deductionTotals.set(item.deduction_type_id, (deductionTotals.get(item.deduction_type_id) || 0) + item.hours);
    return {
        defects: [...defectTotals.entries()].map(([id, quantity]) => {
            const source = resolvedDefects.find((x) => x.defect_type_id === id);
            return { ...source, defect_type_id: id, quantity };
        }),
        deductions: [...deductionTotals.entries()].map(([id, hours]) => {
            const source = resolvedDeductions.find((x) => x.deduction_type_id === id);
            return { ...source, deduction_type_id: id, hours };
        })
    };
};

const validateChildTotals = (data, defects, deductions) => {
    const expectedNg = Math.max(0, Math.trunc(Number(data?.tt_ng || 0) || 0));
    const actualNg = defects.reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.quantity) || 0)), 0);
    if (expectedNg !== actualNg) {
        const error = new Error(`Chi tiết NG (${actualNg}) không khớp TT NG (${expectedNg})`);
        error.status = 422; error.code = "NG_DETAIL_TOTAL_MISMATCH"; error.isPublic = true; error.details = { expected: expectedNg, actual: actualNg }; throw error;
    }
    const expectedMinutes = Math.round((Number(data?.deduction_time || 0) || 0) * 60);
    const actualMinutes = Math.round(deductions.reduce((sum, item) => sum + (Number(item.hours) || 0), 0) * 60);
    // The form stores 70 minutes as 1.17 hours while the canonical detail is
    // 70/60 = 1.166666... . Compare rounded minutes, not raw decimals.
    if (Math.abs(expectedMinutes - actualMinutes) > 1) {
        const error = new Error(`Chi tiết trừ giờ (${actualMinutes} phút) không khớp tổng trừ giờ (${expectedMinutes} phút)`);
        error.status = 422; error.code = "DEDUCTION_DETAIL_TOTAL_MISMATCH"; error.isPublic = true; error.details = { expectedMinutes, actualMinutes }; throw error;
    }
};

const createAuditAfterChildren = async ({ tempId, audit, data, requestId, logicalDuplicateKey }) => {
    const connection = await getConnection();
    try {
        await beginTransaction(connection);
        const snapshot = await AuditService.loadTempReportSnapshot(tempId, connection);
        if (snapshot) await AuditService.createReportVersion({ reportType: "temp", reportId: tempId, snapshot, reason: "Tạo báo cáo chờ duyệt", userId: Number(audit?.userId || 0) }, connection);
        await createModel.logAction({ reportType: "temp", reportId: tempId, userId: Number(audit?.userId || 0), action: "CREATE", note: audit?.note || "Công nhân tạo báo cáo", ipAddress: audit?.ipAddress || null, userAgent: audit?.userAgent || null }, connection);
        await query(connection,
            `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, metadata_json, ip_address, user_agent)
             VALUES (?, 'CREATE_REPORT', 'temp_report', ?, ?, ?, ?, ?)`,
            [Number(audit?.userId || 0), String(tempId), "Công nhân tạo báo cáo chờ duyệt",
                JSON.stringify({ processId: data.process_id, workDate: data.work_date, shift: data.shift, clientRequestId: requestId, logicalDuplicateKey }), audit?.ipAddress || null, audit?.userAgent || null]);
        await commit(connection);
    } catch (error) { await rollback(connection); throw error; }
    finally { connection.release(); }
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
    if (!Number.isInteger(workerId) || workerId <= 0) { const e = new Error("Không xác định được nhân viên để tạo báo cáo"); e.status = 422; e.code = "TRAINING_SNAPSHOT_WORKER_REQUIRED"; e.isPublic = true; throw e; }
    const requestId = String(data.client_request_id || "").trim();
    if (!requestId) { const e = new Error("Thiếu mã yêu cầu gửi báo cáo"); e.status = 400; e.code = "CLIENT_REQUEST_ID_REQUIRED"; e.isPublic = true; throw e; }

    const existingRequest = await findExistingClientRequest(data);
    if (existingRequest) return idempotent(existingRequest);

    const processCode = String(data.process_code || data.extra_data?.process_code || "").trim().toUpperCase();
    if (Number(data.process_id) === 60006 || processCode === "CVK") {
        data.process_id = 60006; data.process_code = "CVK";
        await enforceDailyWorkerHours(data);
        return nonProductWorkModel.createCompleteReport({ data, defects: defectsInput, deductions: deductionsInput, audit });
    }

    await enforceDailyWorkerHours(data);
    return runSerialized(queueKey(data, machineLines), async () => {
        const existingBefore = await findExistingClientRequest(data);
        if (existingBefore) return idempotent(existingBefore);

        data.logical_duplicate_key = buildLogicalDuplicateKey({ workerId: data.worker_id, processId: data.process_id, workDate: data.work_date, shift: data.shift, operationMode: data.operation_mode ?? data.operationMode, machineNo: data.machine_no, productName: data.product_name, machineLines });

        const tempDuplicate = await createModel.findSimilarTempReport({ workerId: data.worker_id, processId: data.process_id, workDate: data.work_date, shift: data.shift, machineNo: data.machine_no, productName: data.product_name, logicalDuplicateKey: data.logical_duplicate_key });
        const approvedDuplicate = tempDuplicate ? null : await createModel.findSimilarApprovedReport({ workerId: data.worker_id, processId: data.process_id, workDate: data.work_date, shift: data.shift, logicalDuplicateKey: data.logical_duplicate_key });
        const existingDuplicate = tempDuplicate || approvedDuplicate;
        if (existingDuplicate) {
            if (!data.force_create) { const e = new Error("Báo cáo trùng với báo cáo đã tồn tại trong cùng ngày/ca"); e.status = 409; e.code = "DUPLICATE_CONFIRMATION_REQUIRED"; e.isPublic = true; e.existing_report = existingDuplicate; e.details = existingDuplicate; throw e; }
            const confirmation = verifyDuplicateConfirmation(data.duplicate_confirmation_token, { workerId: data.worker_id, logicalDuplicateKey: data.logical_duplicate_key, existingReportId: existingDuplicate.id, existingReportType: existingDuplicate.report_type || "temp" });
            if (!confirmation.valid) { const e = new Error("Xác nhận tạo báo cáo trùng không hợp lệ hoặc đã hết hạn"); e.status = 409; e.code = "DUPLICATE_CONFIRMATION_REQUIRED"; e.isPublic = true; e.existing_report = existingDuplicate; throw e; }
        } else if (data.force_create) { const e = new Error("Không có báo cáo trùng hợp lệ để xác nhận tạo lần thứ hai"); e.status = 409; e.code = "DUPLICATE_CONFIRMATION_REQUIRED"; e.isPublic = true; throw e; }

        const processRows = await query(db, `SELECT process_code FROM processes WHERE id=? LIMIT 1`, [Number(data.process_id)]);
        const training = await resolveInitialTrainingSnapshot({ executor: db, workerId: data.worker_id, processId: data.process_id, workDate: data.work_date, trainingPercent: data.training_percent });
        data.training_percent_snapshot = Number(training);
        data.standard_version_id = data.standard_version_id || null;
        data.machine_standard_id = data.machine_standard_id || null;
        data.exclude_kqd_from_tt_snapshot = data.exclude_kqd_from_tt_snapshot ?? data.exclude_kqd_from_tt ?? null;

        if (machineLines.length) {
            const capacity = await validateMachineWorkerCapacityLocked({ executor: db, processCode: processRows[0]?.process_code, processId: data.process_id, machineLines, workerId: data.worker_id, workDate: data.work_date, shift: data.shift });
            if (!capacity.valid) { const e = new Error("Số công nhân trên máy vượt giới hạn trong cùng ngày/ca"); e.status = 422; e.code = "MACHINE_WORKER_LIMIT_EXCEEDED"; e.isPublic = true; e.details = capacity.errors; throw e; }
        }

        const auditUserId = Number(audit?.userId || 0);
        if (!Number.isInteger(auditUserId) || auditUserId <= 0) { const e = new Error("Không xác định được người tạo báo cáo để ghi audit"); e.status = 422; e.code = "REPORT_AUDIT_ACTOR_REQUIRED"; e.isPublic = true; throw e; }

        // Preflight the exact master rows before the parent INSERT. This makes
        // it impossible to create a report that only has tt_ng/deduction_time.
        const validationConnection = await getConnection();
        let defects;
        let deductions;
        try {
            await beginTransaction(validationConnection);
            const resolved = await resolveMasterDetails(data.process_id, defectsInput, deductionsInput, validationConnection);
            defects = resolved.defects;
            deductions = resolved.deductions;
            validateChildTotals(data, defects, deductions);
            await rollback(validationConnection);
        } catch (error) {
            try { await rollback(validationConnection); } catch {}
            throw error;
        } finally { validationConnection.release(); }

        let tempId;
        const parentConnection = await getConnection();
        try {
            await beginTransaction(parentConnection);
            const race = await findExistingClientRequest(data, parentConnection);
            if (race) { await commit(parentConnection); return idempotent(race); }
            try { tempId = await createModel.create(data, parentConnection); }
            catch (error) {
                await rollback(parentConnection);
                if (error?.code === "ER_DUP_ENTRY") { const existing = await findExistingClientRequest(data); if (existing) return idempotent(existing); }
                if (is1205(error)) return recoverAfter1205(data);
                throw error;
            }
            await commit(parentConnection);
        } finally { parentConnection.release(); }

        // Persist child data in its own short transaction. Audit is deliberately
        // separate so an audit/version failure cannot erase NG/trừ giờ details.
        const childConnection = await getConnection();
        try {
            await beginTransaction(childConnection);
            await createModel.createDefects(tempId, data.process_id, defects, childConnection);
            await createModel.createDeductions(tempId, data.process_id, deductions, childConnection);
            await createModel.replaceMachineLines(tempId, machineLines, childConnection);
            await commit(childConnection);
        } catch (error) {
            await rollback(childConnection);
            try { await query(db, `UPDATE production_reports_temp SET status='need_fix', review_note=? WHERE id=?`, [`Không thể lưu chi tiết báo cáo: ${String(error?.message || error).slice(0,450)}`, tempId]); } catch {}
            if (is1205(error)) return recoverAfter1205(data);
            const e = new Error(`Không thể lưu chi tiết báo cáo: ${String(error?.message || error)}`);
            e.status = Number(error?.status) >= 400 ? Number(error.status) : 422;
            e.code = error?.code || "REPORT_DETAIL_PERSIST_FAILED";
            e.isPublic = true; e.details = error?.details || { temp_report_id: tempId }; throw e;
        } finally { childConnection.release(); }

        let auditWarning = null;
        try { await createAuditAfterChildren({ tempId, audit, data, requestId, logicalDuplicateKey: data.logical_duplicate_key }); }
        catch (error) {
            auditWarning = String(error?.message || error).slice(0,450);
            try { await query(db, `UPDATE production_reports_temp SET review_note=? WHERE id=?`, [`Audit chưa hoàn tất: ${auditWarning}`, tempId]); } catch {}
        }

        return { id: Number(tempId), duplicate: false, duplicate_reason: null, existing_report: null, logical_duplicate_key: data.logical_duplicate_key, audit_warning: auditWarning };
    });
};

module.exports = { ...createModel, createCompleteReport, ...readModel, ...reviewModel, ...historyModel, enforceDailyWorkerHours };
