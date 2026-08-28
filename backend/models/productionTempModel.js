const db = require("../config/db");
const createModel = require("./productionTempCreateModel");
const readModel = require("./productionTempReadModel");
const reviewModel = require("./productionTempReviewModel");
const historyModel = require("./productionTempHistoryModel");

const DAILY_HOURS_LIMIT = 12;

/**
 * The daily-hours rule is enforced at the worker/date boundary, not per
 * report. actual_time is the counted production time; deduction/support hours
 * are intentionally excluded from the 12h daily limit.
 *
 * A TiDB advisory lock serializes submissions for the same worker/date so two
 * simultaneous requests cannot both pass the check before either row exists.
 */
const enforceDailyWorkerHours = async (data) => {
    const workerId = Number(data?.worker_id);
    const workDate = String(data?.work_date || "").slice(0, 10);
    const incomingActualHours = Number(data?.actual_time) || 0;

    if (!Number.isInteger(workerId) || workerId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
        return null;
    }

    const connection = await db.promise().getConnection();
    const lockName = `ktc:worker-daily-hours:${workerId}:${workDate}`;
    let locked = false;

    try {
        const [lockRows] = await connection.query("SELECT GET_LOCK(?, 10) AS acquired", [lockName]);
        locked = Number(lockRows?.[0]?.acquired) === 1;
        if (!locked) {
            const error = new Error("Không thể kiểm tra tổng giờ trong ngày, vui lòng gửi lại sau.");
            error.status = 503;
            error.code = "DAILY_HOURS_LOCK_TIMEOUT";
            error.isPublic = true;
            throw error;
        }

        const [approvedRows] = await connection.query(
            `SELECT COALESCE(SUM(COALESCE(actual_time, 0)), 0) AS counted_hours
             FROM production_reports
             WHERE worker_id = ?
               AND work_date = ?
               AND status <> 'deleted'`,
            [workerId, workDate]
        );

        const [tempRows] = await connection.query(
            `SELECT COALESCE(SUM(COALESCE(actual_time, 0)), 0) AS counted_hours
             FROM production_reports_temp
             WHERE worker_id = ?
               AND work_date = ?
               AND status IN ('pending', 'need_fix')`,
            [workerId, workDate]
        );

        const existingHours =
            Number(approvedRows?.[0]?.counted_hours || 0) +
            Number(tempRows?.[0]?.counted_hours || 0);
        const projectedHours = existingHours + incomingActualHours;

        if (projectedHours > DAILY_HOURS_LIMIT + 0.000001) {
            const remainingHours = Math.max(0, DAILY_HOURS_LIMIT - existingHours);
            const error = new Error(
                `Tổng giờ làm được tính trong ngày không được vượt quá 12 giờ. ` +
                `Hiện đã có ${existingHours.toFixed(2)} giờ, báo cáo này thêm ${incomingActualHours.toFixed(2)} giờ, ` +
                `chỉ còn ${remainingHours.toFixed(2)} giờ.`
            );
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
                excluded_from_daily_limit: "deduction_time / support hours"
            };
            throw error;
        }

        return {
            existingHours,
            incomingActualHours,
            projectedHours,
            limitHours: DAILY_HOURS_LIMIT,
            lockName,
            lockConnection: connection
        };
    } catch (error) {
        if (!locked) connection.release();
        throw error;
    }
};

const releaseDailyWorkerHoursLock = async (state) => {
    if (!state?.lockConnection || !state?.lockName) return;
    try {
        await state.lockConnection.query("SELECT RELEASE_LOCK(?) AS released", [state.lockName]);
    } finally {
        state.lockConnection.release();
    }
};

/**
 * Public facade for temporary production reports.
 *
 * The implementation is split by responsibility so creation, queries,
 * approval/review and history can evolve independently while callers keep
 * the original ProductionTemp API.
 *
 * Compatibility note:
 * createCompleteReport historically accepted the payload object used by the
 * worker controller, while the split create model currently accepts the
 * individual arguments. Normalize that boundary here so worker submissions
 * cannot accidentally pass { data, defects, ... } as the report itself.
 *
 * Worker identity compatibility:
 * the controller's canonical field is worker_id, while older split-model
 * code paths may read workerId. Keep both aliases populated at this boundary
 * so training snapshots, duplicate protection and report creation all use the
 * same authenticated worker identity.
 */
const createCompleteReport = async (payload = {}, legacyDefects, legacyDeductions, legacyMachineLines, legacyAudit) => {
    const isWrappedPayload = payload && typeof payload === "object" && payload.data && typeof payload.data === "object";
    const rawData = isWrappedPayload ? payload.data : payload;

    const data = {
        ...(rawData || {}),
        worker_id: rawData?.worker_id ?? rawData?.workerId ?? null,
        workerId: rawData?.workerId ?? rawData?.worker_id ?? null,
    };

    const defects = isWrappedPayload
        ? (Array.isArray(payload.defects) ? payload.defects : [])
        : (Array.isArray(legacyDefects) ? legacyDefects : (Array.isArray(rawData?.defects) ? rawData.defects : []));

    const deductions = isWrappedPayload
        ? (Array.isArray(payload.deductions) ? payload.deductions : [])
        : (Array.isArray(legacyDeductions) ? legacyDeductions : (Array.isArray(rawData?.deductions) ? rawData.deductions : []));

    const machineLines = isWrappedPayload
        ? (Array.isArray(payload.machineLines) ? payload.machineLines : [])
        : (Array.isArray(legacyMachineLines) ? legacyMachineLines : (Array.isArray(rawData?.machineLines) ? rawData.machineLines : []));

    const audit = isWrappedPayload
        ? (payload.audit && typeof payload.audit === "object" ? payload.audit : {})
        : (legacyAudit && typeof legacyAudit === "object" ? legacyAudit : (rawData?.audit && typeof rawData.audit === "object" ? rawData.audit : {}));

    if (!Number.isInteger(Number(data.worker_id)) || Number(data.worker_id) <= 0) {
        const error = new Error("Không xác định được nhân viên để chụp % học việc");
        error.code = "TRAINING_SNAPSHOT_WORKER_REQUIRED";
        error.status = 422;
        error.isPublic = true;
        throw error;
    }

    let dailyHoursState = null;
    try {
        dailyHoursState = await enforceDailyWorkerHours(data);

        const result = await createModel.createCompleteReport(
            data,
            defects,
            deductions,
            machineLines,
            audit,
        );

        if (result && typeof result === "object") return result;
        return {
            id: Number(result),
            duplicate: false,
        };
    } finally {
        await releaseDailyWorkerHoursLock(dailyHoursState);
    }
};

module.exports = {
    ...createModel,
    createCompleteReport,
    ...readModel,
    ...reviewModel,
    ...historyModel,
};
