const createModel = require("./productionTempCreateModel");
const readModel = require("./productionTempReadModel");
const reviewModel = require("./productionTempReviewModel");
const historyModel = require("./productionTempHistoryModel");

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

    const result = await createModel.createCompleteReport(
        data,
        defects,
        deductions,
        machineLines,
        audit,
    );

    // Keep the public facade contract consumed by the worker controller and
    // post-create notification service, even while the lower-level create
    // model returns the inserted numeric id.
    if (result && typeof result === "object") return result;
    return {
        id: Number(result),
        duplicate: false,
    };
};

module.exports = {
    ...createModel,
    createCompleteReport,
    ...readModel,
    ...reviewModel,
    ...historyModel,
};
