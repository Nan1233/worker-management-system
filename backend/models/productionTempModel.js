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
 */
const createCompleteReport = async (payload = {}) => {
    const data = payload?.data ?? payload;
    const defects = Array.isArray(payload?.defects) ? payload.defects : [];
    const deductions = Array.isArray(payload?.deductions) ? payload.deductions : [];
    const machineLines = Array.isArray(payload?.machineLines) ? payload.machineLines : [];
    const audit = payload?.audit && typeof payload.audit === "object" ? payload.audit : {};

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
