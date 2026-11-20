// Infrastructure repository for authoritative process-code resolution.
// Preserve the single-row SQL result shape expected by the submission workflow.
const db = require("../config/db");
const { query } = require("../models/productionTempModelShared");

async function findSubmissionProcessCode(processId, executor = db) {
    return query(executor, `SELECT process_code FROM processes WHERE id=? LIMIT 1`, [Number(processId)]);
}

module.exports = { findSubmissionProcessCode };
