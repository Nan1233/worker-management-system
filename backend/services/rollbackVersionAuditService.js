const { classifyApprovedVersionSnapshot } = require('./approvedVersionSnapshotService');

function query(executor, sql, params = []) {
  return executor.promise ? executor.promise().query(sql, params) : executor.query(sql, params);
}

async function auditRollbackVersions({ executor = null } = {}) {
  const activeExecutor = executor || require('../config/db');
  const rows = await query(activeExecutor,
    `SELECT report_id, version_no, created_at, snapshot_json
     FROM report_versions
     WHERE report_type='approved'
     ORDER BY report_id ASC, version_no ASC`);
  return rows.map((row) => {
    const result = classifyApprovedVersionSnapshot(row.snapshot_json);
    return {
      report_id: Number(row.report_id),
      version_no: Number(row.version_no),
      created_at: row.created_at || null,
      schema_version: result.schema_version,
      missing_components: result.missing_components,
      classification: result.classification,
      restore_safe: result.restore_safe,
      reasons: result.reasons
    };
  });
}

module.exports = { auditRollbackVersions };
