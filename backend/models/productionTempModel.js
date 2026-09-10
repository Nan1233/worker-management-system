const db = require("../config/db");
const createModel = require("./productionTempCreateModel");
const nonProductWorkModel = require("./nonProductWorkCreateModel");
const readModel = require("./productionTempReadModel");
const reviewModel = require("./productionTempReviewModel");
const historyModel = require("./productionTempHistoryModel");
const { query, getConnection } = require("./productionTempModelShared");
const { withDistributedSubmissionLock } = require("../services/productionSubmissionLockService");
const { buildLogicalDuplicateKey } = require("../services/logicalDuplicateReportService");

const DAILY_HOURS_LIMIT = 12;
const submissionQueues = new Map();

const runSerialized = async (key, task) => {
    const previous = submissionQueues.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    submissionQueues.set(key, current);
    await previous;
    try { return await task(); } finally { release(); if (submissionQueues.get(key) === current) submissionQueues.delete(key); }
};

const getSubmissionQueueKey = (data, machineLines = []) => {
    const workerId = Number(data?.worker_id || data?.workerId || 0);
    const processId = Number(data?.process_id || 0);
    const workDate = String(data?.work_date || "").slice(0, 10);
    const shift = String(data?.shift || "").trim().toUpperCase();
    const logicalKey = String(data?.logical_duplicate_key || "").trim();
    const clientRequestId = String(data?.client_request_id || "").trim();
    if (clientRequestId) return `client:${workerId}:${clientRequestId}`;
    if (logicalKey) return `logical:${workerId}:${logicalKey}`;
    const machines = [...new Set((Array.isArray(machineLines) ? machineLines : []).map((line) => String(line?.machine_code || "").trim().toUpperCase()).filter(Boolean))].sort().join(",");
    return `capacity:${workerId}:${processId}:${workDate}:${shift}:${machines || "MANUAL"}`;
};

const originalCreate = createModel.create;
createModel.create = async (data, executor = db) => {
    const result = await originalCreate(data, executor);
    const insertedId = Number(result);
    if (Number.isInteger(insertedId) && insertedId > 0) return insertedId;
    const workerId = Number(data?.worker_id);
    const clientRequestId = String(data?.client_request_id || "").trim();
    if (!Number.isInteger(workerId) || workerId <= 0 || !clientRequestId) { const error = new Error("Không lấy được mã báo cáo tạm sau khi tạo"); error.code = "TEMP_REPORT_ID_UNAVAILABLE"; error.status = 500; throw error; }
    const rows = await query(executor, `SELECT id FROM production_reports_temp WHERE worker_id = ? AND client_request_id = ? LIMIT 1`, [workerId, clientRequestId]);
    const recoveredId = Number(rows?.[0]?.id);
    if (Number.isInteger(recoveredId) && recoveredId > 0) return recoveredId;
    const error = new Error("Đã tạo báo cáo nhưng không xác định được mã báo cáo tạm"); error.code = "TEMP_REPORT_ID_UNAVAILABLE"; error.status = 500; throw error;
};

const findExistingClientRequest = async (data, executor = db) => {
    const workerId = Number(data?.worker_id);
    const clientRequestId = String(data?.client_request_id || "").trim();
    if (!Number.isInteger(workerId) || workerId <= 0 || !clientRequestId) return null;
    const rows = await query(executor, `SELECT id, status FROM production_reports_temp WHERE worker_id = ? AND client_request_id = ? LIMIT 1`, [workerId, clientRequestId]);
    return rows?.[0] || null;
};
const toIdempotentResult = (existing) => ({ id: Number(existing.id), duplicate: true, duplicate_reason: "request_id", existing_report: existing });
const isLockWaitTimeout = (error) => { const message = String(error?.message || "").toLowerCase(); return Number(error?.errno) === 1205 || message.includes("error 1205") || message.includes("lock wait timeout exceeded"); };
const recoverTimedOutSubmission = async (data) => { const existing = await findExistingClientRequest(data); if (existing) return toIdempotentResult(existing); const error = new Error("Hệ thống đang xử lý một yêu cầu gửi báo cáo khác. Vui lòng thử lại sau vài giây."); error.status = 409; error.code = "PRODUCTION_SUBMISSION_BUSY"; error.isPublic = true; throw error; };

const enforceDailyWorkerHours = async (data, executor = db) => {
    const workerId = Number(data?.worker_id); const workDate = String(data?.work_date || "").slice(0, 10); const incomingActualHours = Number(data?.actual_time) || 0;
    if (!Number.isInteger(workerId) || workerId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return null;
    const approvedRows = await query(executor, `SELECT COALESCE(SUM(COALESCE(actual_time, 0)), 0) AS counted_hours FROM production_reports WHERE worker_id = ? AND work_date = ? AND status = 'approved'`, [workerId, workDate]);
    const tempRows = await query(executor, `SELECT COALESCE(SUM(COALESCE(actual_time, 0)), 0) AS counted_hours FROM production_reports_temp WHERE worker_id = ? AND work_date = ? AND status IN ('pending', 'need_fix')`, [workerId, workDate]);
    const existingHours = Number(approvedRows?.[0]?.counted_hours || 0) + Number(tempRows?.[0]?.counted_hours || 0); const projectedHours = existingHours + incomingActualHours;
    if (projectedHours > DAILY_HOURS_LIMIT + 0.000001) { const remainingHours = Math.max(0, DAILY_HOURS_LIMIT - existingHours); const error = new Error(`Tổng giờ làm được tính trong ngày không được vượt quá 12 giờ. Hiện đã có ${existingHours.toFixed(2)} giờ, báo cáo này thêm ${incomingActualHours.toFixed(2)} giờ, chỉ còn ${remainingHours.toFixed(2)} giờ.`); error.status = 422; error.code = "DAILY_WORKING_HOURS_LIMIT_EXCEEDED"; error.isPublic = true; error.details = { worker_id: workerId, work_date: workDate, existing_hours: Number(existingHours.toFixed(4)), incoming_hours: Number(incomingActualHours.toFixed(4)), projected_hours: Number(projectedHours.toFixed(4)), limit_hours: DAILY_HOURS_LIMIT, remaining_hours: Number(remainingHours.toFixed(4)), counted_field: "actual_time", excluded_from_daily_limit: "deduction_time / support hours / rejected reports" }; throw error; }
    return { existingHours, incomingActualHours, projectedHours, limitHours: DAILY_HOURS_LIMIT };
};

const findApprovedDuplicateReadOnly = async ({ workerId, processId, workDate, shift, logicalDuplicateKey }, executor = db) => {
    if (!logicalDuplicateKey) return null;
    const rows = await query(executor, `SELECT id, worker_id, process_id, work_date, shift, operation_mode, machine_no, product_name, status, created_at, updated_at FROM production_reports WHERE worker_id=? AND process_id=? AND work_date=? AND shift=? AND status <> 'deleted' ORDER BY id DESC`, [workerId, processId, workDate, shift]);
    if (!rows.length) return null;
    const ids = rows.map((row) => Number(row.id)).filter(Boolean); const placeholders = ids.map(() => '?').join(',');
    const machineRows = ids.length ? await query(executor, `SELECT report_id,machine_code,product_code,sort_order,id FROM production_report_machine_lines WHERE report_id IN (${placeholders}) ORDER BY report_id,sort_order,id`, ids) : [];
    const byReport = new Map(); for (const line of machineRows) { const reportId = Number(line.report_id); if (!byReport.has(reportId)) byReport.set(reportId, []); byReport.get(reportId).push(line); }
    for (const row of rows) { const key = buildLogicalDuplicateKey({ workerId: row.worker_id, processId: row.process_id, workDate: row.work_date, shift: row.shift, operationMode: row.operation_mode, machineNo: row.machine_no, productName: row.product_name, machineLines: byReport.get(Number(row.id)) || [] }); if (key === logicalDuplicateKey) return { ...row, report_type: 'approved' }; }
    return null;
};
createModel.findSimilarApprovedReport = findApprovedDuplicateReadOnly;

const createCompleteReport = async (payload = {}, legacyDefects, legacyDeductions, legacyMachineLines, legacyAudit) => {
    const isWrappedPayload = payload && typeof payload === "object" && payload.data && typeof payload.data === "object";
    const rawData = isWrappedPayload ? payload.data : payload;
    const data = { ...(rawData || {}), worker_id: rawData?.worker_id ?? rawData?.workerId ?? null, workerId: rawData?.workerId ?? rawData?.worker_id ?? null };
    const defects = isWrappedPayload ? (Array.isArray(payload.defects) ? payload.defects : []) : (Array.isArray(legacyDefects) ? legacyDefects : (Array.isArray(rawData?.defects) ? rawData.defects : []));
    const deductions = isWrappedPayload ? (Array.isArray(payload.deductions) ? payload.deductions : []) : (Array.isArray(legacyDeductions) ? legacyDeductions : (Array.isArray(rawData?.deductions) ? rawData.deductions : []));
    const machineLines = isWrappedPayload ? (Array.isArray(payload.machineLines) ? payload.machineLines : []) : (Array.isArray(legacyMachineLines) ? legacyMachineLines : (Array.isArray(rawData?.machineLines) ? rawData.machineLines : []));
    const audit = isWrappedPayload ? (payload.audit && typeof payload.audit === "object" ? payload.audit : {}) : (legacyAudit && typeof legacyAudit === "object" ? legacyAudit : (rawData?.audit && typeof rawData.audit === "object" ? rawData.audit : {}));
    if (!Number.isInteger(Number(data.worker_id)) || Number(data.worker_id) <= 0) { const error = new Error("Không xác định được nhân viên để chụp % học việc"); error.code = "TRAINING_SNAPSHOT_WORKER_REQUIRED"; error.status = 422; error.isPublic = true; throw error; }
    const processCode = String(data.process_code || data.extra_data?.process_code || "").trim().toUpperCase(); const isNonProductWork = Number(data.process_id) === 60006 || processCode === "CVK";
    if (isNonProductWork) { const existing = await findExistingClientRequest(data); if (existing) return toIdempotentResult(existing); data.process_id = 60006; data.process_code = "CVK"; await enforceDailyWorkerHours(data); return nonProductWorkModel.createCompleteReport({ data, defects, deductions, audit }); }
    const existing = await findExistingClientRequest(data); if (existing) return toIdempotentResult(existing); await enforceDailyWorkerHours(data);
    const queueKey = getSubmissionQueueKey(data, machineLines);
    return runSerialized(queueKey, async () => { const alreadyCreated = await findExistingClientRequest(data); if (alreadyCreated) return toIdempotentResult(alreadyCreated); return withDistributedSubmissionLock(data, machineLines, async () => { const lockedExisting = await findExistingClientRequest(data); if (lockedExisting) return toIdempotentResult(lockedExisting); try { const result = await createModel.createCompleteReport(data, defects, deductions, machineLines, audit); if (result && typeof result === "object") return result; return { id: Number(result), duplicate: false }; } catch (error) { if (isLockWaitTimeout(error) && String(data?.client_request_id || "").trim()) return recoverTimedOutSubmission(data); throw error; } }); });
};
module.exports = { ...createModel, createCompleteReport, ...readModel, ...reviewModel, ...historyModel };