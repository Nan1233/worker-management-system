// Infrastructure: approval SQL execution with the existing slow-query/error diagnostics.
const { query } = require("../models/productionTempModelShared");

const APPROVAL_SLOW_QUERY_MS = 750;

function sqlForApprovalLog(sql) {
  return String(sql).replace(/\s+/g, " ").slice(0, 260);
}

async function qRows(executor, sql, params = []) {
  const started = Date.now();
  try {
    const result = await query(executor, sql, params);
    const elapsed = Date.now() - started;
    if (elapsed >= APPROVAL_SLOW_QUERY_MS) {
      console.warn(`[KTC][APPROVAL_QUERY] ms=${elapsed} sql=${sqlForApprovalLog(sql)}`);
    }
    return result;
  } catch (error) {
    console.error(
      `[KTC][APPROVAL_QUERY_ERROR] ms=${Date.now() - started} code=${error?.code || ""} sql=${sqlForApprovalLog(sql)} message=${String(error?.message || error).slice(0, 200)}`
    );
    throw error;
  }
}

module.exports = { qRows };
