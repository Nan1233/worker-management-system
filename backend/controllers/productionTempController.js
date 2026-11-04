const workerController = require("./productionTempWorkerController");
const managementController = require("./productionTempManagementController");
const dailyHoursController = require("./productionTempDailyHoursController");
const editProposalController = require("./productionTempEditProposalController");
const createController = require("./productionTempCreateController");
const reviewController = require("./productionTempReviewController");

module.exports = {
    ...workerController,
    ...managementController,
    ...createController,
    ...reviewController,
    getDailyHours: dailyHoursController.getDailyHours,
    getEditProposals: editProposalController.getEditProposals,
    createEditProposal: editProposalController.createEditProposal,
    updateEditProposal: editProposalController.updateEditProposal,
    deleteEditProposal: editProposalController.deleteEditProposal,
    requestEditProposal: editProposalController.requestEditProposal,
    reviewEditProposal: editProposalController.reviewEditProposal
};
