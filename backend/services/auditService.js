const db = require('../config/db');

const json = (value) => JSON.stringify(value ?? null);
const query = (executor, sql, params) => executor.promise ? executor.promise().query(sql, params) : executor.query(sql, params);

async function logActivity({ userId = null, action, entityType = null, entityId = null, description = null, metadata = null, req = null }, executor = db) {
  await query(executor,
    `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description, metadata_json, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, action, entityType, entityId, description, json(metadata), req?.ip || null, req?.headers?.['user-agent'] || null]
  );
}

async function createReportVersion({ reportType, reportId, snapshot, reason = null, userId = null }, executor = db) {
  const [rows] = await query(executor,
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version FROM report_versions WHERE report_type=? AND report_id=?`,
    [reportType, reportId]
  );
  const versionNo = Number(rows[0]?.next_version || 1);
  await query(executor,
    `INSERT INTO report_versions (report_type, report_id, version_no, snapshot_json, change_reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reportType, reportId, versionNo, json(snapshot), reason, userId]
  );
  return versionNo;
}

async function notifyUsers(userIds, payload, executor = db) {
  const ids = [...new Set((userIds || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return;
  const values = ids.map(() => '(?,?,?,?,?,?,?)').join(',');
  const params = ids.flatMap(id => [id, payload.type || 'info', payload.title, payload.message, payload.linkUrl || null, payload.entityType || null, payload.entityId || null]);
  await query(executor,
    `INSERT INTO notifications (user_id,type,title,message,link_url,entity_type,entity_id) VALUES ${values}`,
    params
  );
}

module.exports = { logActivity, createReportVersion, notifyUsers };
