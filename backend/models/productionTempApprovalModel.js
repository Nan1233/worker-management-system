'use strict';

// Compatibility facade. Keep public signatures stable for existing controllers.
const { approveSelected } = require('./productionApprovalWorkflow');
const { rejectSelected } = require('./productionRejectionWorkflow');

module.exports = { approveSelected, rejectSelected };
