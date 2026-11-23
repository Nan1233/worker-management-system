'use strict';

const { query } = require('../models/productionTempModelShared');
const { buildRejectedReportUpdate } = require('../models/productionTempRejectionBuilders');

/** Conditionally reject one temporary report using its optimistic version. */
async function transitionRejectedTemp(connection, report, expectedUpdatedAt, reason, reviewerId) {
  const { sql, params } = buildRejectedReportUpdate(report, expectedUpdatedAt, reason, reviewerId);
  return query(connection, sql, params);
}

module.exports = { transitionRejectedTemp };
