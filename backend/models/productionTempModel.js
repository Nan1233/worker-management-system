const createModel = require("./productionTempCreateModel");
const nonProductWorkModel = require("./nonProductWorkCreateModel");
const readModel = require("./productionTempReadModel");
const reviewModel = require("./productionTempReviewModel");
const historyModel = require("./productionTempHistoryModel");
const updateModel = require("./productionTempUpdateModel");
const submissionService = require("../services/productionTempSubmissionService");

// Keep the public model facade stable while submission orchestration lives in a service.
module.exports = {
    ...createModel,
    ...submissionService,
    ...readModel,
    ...reviewModel,
    ...historyModel,
    ...updateModel,
    ...nonProductWorkModel,
};
