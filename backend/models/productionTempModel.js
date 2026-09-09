const db = require("../config/db");
const createModel = require("./productionTempCreateModel");
const nonProductWorkModel = require("./nonProductWorkCreateModel");
const readModel = require("./productionTempReadModel");
const reviewModel = require("./productionTempReviewModel");
const historyModel = require("./productionTempHistoryModel");
const { query } = require("./productionTempModelShared");

const DAILY_HOURS_LIMIT = 12;

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

const enforceDailyWorkerHours = async (data, executor = db) => {
    const workerId = Number(data?.worker_id);
    const workDate = String(data?.work_date || "").slice(0, 10);
    const incomingActualHours = Number(data?.actual_time) || 0;
    if (!Number.isInteger(workerId) || workerId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return null;

    const approvedRows = await query(executor, `SELECT COALESCE(SUM(COALESCE(actual_time, 0)), 0) AS counted_hours FROM production_reports WHERE worker_id = ? AND work_date = ? AND status <> 'deleted'`, [workerId, workDate]);
    const tempRows = await query(executor, `SELECT COALESCE(SUM(COALESCE(actual_time, 0)), 0) AS counted_hours FROM production_reports_temp WHERE worker_id = ? AND work_date = ? AND status IN ('pending', 'need_fix')`, [workerId, workDate]);
    const existingHours = Number(approvedRows?.[0]?.counted_hours || 0) + Number(tempRows?.[0]?.counted_hours || 0);
    const projectedHours = existingHours + incomingActualHours;
    if (projectedHours > DAILY_HOURS_LIMIT + 0.000001) {
        const remainingHours = Math.max(0, DAILY_HOURS_LIMIT - existingHours);
        const error = new Error(`Tổng giờ làm được tính trong ngày không được vượt quá 12 giờ. Hiện đã có ${existingHours.toFixed(2)} giờ, báo cáo này thêm ${incomingActualHours.toFixed(2)} giờ, chỉ còn ${remainingHours.toFixed(2)} giờ.`);
        error.status = 422;
        error.code = "DAILY_WORKING_HOURS_LIMIT_EXCEEDED";
        error.isPublic = true;
        error.details = { worker_id: workerId, work_date: workDate, existing_hours: Number(existingHours.toFixed(4)), incoming_hours: Number(incomingActualHours.toFixed(4)), projected_hours: Number(projectedHours.toFixed(4)), limit_hours: DAILY_HOURS_LIMIT, remaining_hours: Number(remainingHours.toFixed(4)), counted_field: "actual_time", excluded_from_daily_limit: "deduction_time / support hours" };
        throw error;
    }
    return { existingHours, incomingActualHours, projectedHours, limitHours: DAILY_HOURS_LIMIT };
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
        data.process_id = 60006;
        data.process_code = "CVK";
        await enforceDailyWorkerHours(data);
        return nonProductWorkModel.createCompleteReport({ data, defects, deductions, audit });
    }

    await enforceDailyWorkerHours(data);
    const result = await createModel.createCompleteReport(data, defects, deductions, machineLines, audit);
    if (result && typeof result === "object") return result;
    return { id: Number(result), duplicate: false };
};

module.exports = { ...createModel, createCompleteReport, ...readModel, ...reviewModel, ...historyModel };
