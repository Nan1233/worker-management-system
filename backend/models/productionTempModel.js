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
 */
module.exports = {
    ...createModel,
    ...readModel,
    ...reviewModel,
    ...historyModel,
};
