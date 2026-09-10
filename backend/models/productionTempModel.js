const db = require("../config/db");
const createModel = require("./productionTempCreateModel");
const nonProductWorkModel = require("./nonProductWorkCreateModel");
const readModel = require("./productionTempReadModel");
const reviewModel = require("./productionTempReviewModel");
const historyModel = require("./productionTempHistoryModel");
const { query } = require("./productionTempModelShared");

const DAILY_HOURS_LIMIT = 12;
const LOCK_RETRY_ATTEMPTS = 3;
const LOCK_RETRY_DELAYS_MS = [250, 750];

const isLockWaitTimeout = (error) => {
    const code = String(error?.code || "").toUpperCase();
    const message = String(error?.message || "").toLowerCase();
    return code === "ER_LOCK_WAIT_TIMEOUT" ||
        Number(error?.errno) === 1205 ||
        message.includes("lock wait timeout exceeded") ||
        message.includes("error 1205");
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const originalCreate = createModel.create;
createModel.create = async (data, executor = db) => {
    const result = await originalCreate(data, executor);
    const insertedId = Number(result);
    if (Number.isInteger(insertedId) && insertedId > 0) return insertedId;

    const workerId = Number(data?.worker_id);
    const clientRequestId = String(data?.client_request_id || "").trim();
    if (!Number.isInteger(workerId) || workerId <= 0 || !clientRequestId) {
        const error = new Error("Không lấy được mã báo cáo tạm sau khi tạo");
        error.code = "TEMP_REPORT_ID_UNAVAILABLE";
        error.status = 500;
        throw error;
    }
    const rows = await query(executor, `SELECT id FROM production_reports_temp WHERE worker_id = ? AND client_request_id = ? LIMIT 1`, [workerId, clientRequestId]);
    const recoveredId = Number(rows?.[0]?.id);
    if (Number.isInteger(recoveredId) && recoveredId > 0) return recoveredId;
    const error = new Error("Đã tạo báo cáo nhưng không xác định được mã báo cáo tạm");
    error.code = "TEMP_REPORT_ID_UNAVAILABLE";
    error.status = 500;
    throw error;
};

const findExistingClientRequest = async (data, executor = db) => {
    const workerId = Number(data?.worker_id);
    const clientRequestId = String(data?.client_request_id || "").trim();
    if (!Number.isInteger(workerId) || workerId <= 0 || !clientRequestId) return null;

    const rows = await query(
        executor,
        `SELECT id, status
         FROM production_reports_temp
         WHERE worker_id = ? AND client_request_id = ?
         LIMIT 1`,
        [workerId, clientRequestId]
    );
    return rows?.[0] || null;
};

const toIdempotentResult = (existing) => ({
    id: Number(existing.id),
    duplicate: true,
    duplicate_reason: "request_id",
    existing_report: existing,
});

const enforceDailyWorkerHours = async (data, executor = db) => {
    const workerId = Number(data?.worker_id);
    const workDate = String(data?.work_date || "").slice(0, 10);
    const incomingActualHours = Number(data?.actual_time) || 0;

    console.log("[DAILY_HOURS] START", {
        workerId,
        workDate,
        incomingActualHours,
        actualTimeRaw: data?.actual_time,
        hasExecutor: Boolean(executor),
    });

    if (!Number.isInteger(workerId) || workerId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
        console.log("[DAILY_HOURS] SKIP_INVALID_INPUT", { workerId, workDate, actualTimeRaw: data?.actual_time });
        return null;
    }

    try {
        console.log("[DAILY_HOURS] BEFORE_APPROVED_QUERY");
        const approvedRows = await query(executor, `SELECT COALESCE(SUM(COALESCE(actual_time, 0)), 0) AS counted_hours FROM production_reports WHERE worker_id = ? AND work_date = ? AND status = 'approved'`, [workerId, workDate]);
        console.log("[DAILY_HOURS] AFTER_APPROVED_QUERY", { approvedRows });

        console.log("[DAILY_HOURS] BEFORE_TEMP_QUERY");
        const tempRows = await query(executor, `SELECT COALESCE(SUM(COALESCE(actual_time, 0)), 0) AS counted_hours FROM production_reports_temp WHERE worker_id = ? AND work_date = ? AND status IN ('pending', 'need_fix')`, [workerId, workDate]);
        console.log("[DAILY_HOURS] AFTER_TEMP_QUERY", { tempRows });

        const approvedCountedHours = Number(approvedRows?.[0]?.counted_hours || 0);
        const tempCountedHours = Number(tempRows?.[0]?.counted_hours || 0);
        const existingHours = approvedCountedHours + tempCountedHours;
        const projectedHours = existingHours + incomingActualHours;

        console.log("[DAILY_HOURS] CALCULATED", {
            workerId,
            workDate,
            approvedCountedHours,
            tempCountedHours,
            existingHours,
            incomingActualHours,
            projectedHours,
            limitHours: DAILY_HOURS_LIMIT,
        });

        if (projectedHours > DAILY_HOURS_LIMIT + 0.000001) {
            const remainingHours = Math.max(0, DAILY_HOURS_LIMIT - existingHours);
            const error = new Error(`Tổng giờ làm được tính trong ngày không được vượt quá 12 giờ. Hiện đã có ${existingHours.toFixed(2)} giờ, báo cáo này thêm ${incomingActualHours.toFixed(2)} giờ, chỉ còn ${remainingHours.toFixed(2)} giờ.`);
            error.status = 422;
            error.code = "DAILY_WORKING_HOURS_LIMIT_EXCEEDED";
            error.isPublic = true;
            error.details = {
                worker_id: workerId,
                work_date: workDate,
                existing_hours: Number(existingHours.toFixed(4)),
                incoming_hours: Number(incomingActualHours.toFixed(4)),
                projected_hours: Number(projectedHours.toFixed(4)),
                limit_hours: DAILY_HOURS_LIMIT,
                remaining_hours: Number(remainingHours.toFixed(4)),
                counted_field: "actual_time",
                excluded_from_daily_limit: "deduction_time / support hours / rejected reports",
            };
            console.error("[DAILY_HOURS] LIMIT_EXCEEDED", error.message, error.details);
            throw error;
        }

        console.log("[DAILY_HOURS] PASS", { workerId, workDate, existingHours, incomingActualHours, projectedHours });
        return { existingHours, incomingActualHours, projectedHours, limitHours: DAILY_HOURS_LIMIT };
    } catch (error) {
        console.error("[DAILY_HOURS] FAILED", {
            name: error?.name,
            message: error?.message,
            code: error?.code,
            status: error?.status,
            details: error?.details,
            workerId,
            workDate,
            incomingActualHours,
            stack: error?.stack,
        });
        throw error;
    }
};

const createCompleteReport = async (payload = {}, legacyDefects, legacyDeductions, legacyMachineLines, legacyAudit) => {
    const isWrappedPayload = payload && typeof payload === "object" && payload.data && typeof payload.data === "object";
    const rawData = isWrappedPayload ? payload.data : payload;
    const data = { ...(rawData || {}), worker_id: rawData?.worker_id ?? rawData?.workerId ?? null, workerId: rawData?.workerId ?? rawData?.worker_id ?? null };
    const defects = isWrappedPayload ? (Array.isArray(payload.defects) ? payload.defects : []) : (Array.isArray(legacyDefects) ? legacyDefects : (Array.isArray(rawData?.defects) ? rawData.defects : []));
    const deductions = isWrappedPayload ? (Array.isArray(payload.deductions) ? payload.deductions : []) : (Array.isArray(legacyDeductions) ? legacyDeductions : (Array.isArray(rawData?.deductions) ? rawData.deductions : []));
    const machineLines = isWrappedPayload ? (Array.isArray(payload.machineLines) ? payload.machineLines : []) : (Array.isArray(legacyMachineLines) ? legacyMachineLines : (Array.isArray(rawData?.machineLines) ? rawData.machineLines : []));
    const audit = isWrappedPayload ? (payload.audit && typeof payload.audit === "object" ? payload.audit : {}) : (legacyAudit && typeof legacyAudit === "object" ? legacyAudit : (rawData?.audit && typeof rawData.audit === "object" ? rawData.audit : {}));

    if (!Number.isInteger(Number(data.worker_id)) || Number(data.worker_id) <= 0) {
        const error = new Error("Không xác định được nhân viên để chụp % học việc");
        error.code = "TRAINING_SNAPSHOT_WORKER_REQUIRED";
        error.status = 422;
        error.isPublic = true;
        throw error;
    }

    const processCode = String(data.process_code || data.extra_data?.process_code || "").trim().toUpperCase();
    const isNonProductWork = Number(data.process_id) === 60006 || processCode === "CVK";
    if (isNonProductWork) {
        const existing = await findExistingClientRequest(data);
        if (existing) return toIdempotentResult(existing);
        data.process_id = 60006;
        data.process_code = "CVK";
        await enforceDailyWorkerHours(data);
        return nonProductWorkModel.createCompleteReport({ data, defects, deductions, audit });
    }

    const existing = await findExistingClientRequest(data);
    if (existing) return toIdempotentResult(existing);

    await enforceDailyWorkerHours(data);

    for (let attempt = 1; attempt <= LOCK_RETRY_ATTEMPTS; attempt += 1) {
        try {
            const result = await createModel.createCompleteReport(data, defects, deductions, machineLines, audit);
            if (result && typeof result === "object") return result;
            return { id: Number(result), duplicate: false };
        } catch (error) {
            if (!isLockWaitTimeout(error) || attempt >= LOCK_RETRY_ATTEMPTS) throw error;

            console.warn("[KTC][PRODUCTION_TEMP] lock wait timeout; retrying transaction", {
                attempt,
                maxAttempts: LOCK_RETRY_ATTEMPTS,
                workerId: data.worker_id,
                processId: data.process_id,
                workDate: data.work_date,
                shift: data.shift,
                clientRequestId: data.client_request_id,
            });

            await sleep(LOCK_RETRY_DELAYS_MS[attempt - 1] || 1000);

            const recovered = await findExistingClientRequest(data);
            if (recovered) return toIdempotentResult(recovered);
        }
    }

    throw new Error("Không thể tạo báo cáo do xung đột khóa dữ liệu");
};

module.exports = { ...createModel, createCompleteReport, ...readModel, ...reviewModel, ...historyModel };