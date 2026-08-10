const db = require('../config/db');

const json = (value) => JSON.stringify(value ?? null);
const query = (executor, sql, params = []) => executor.promise
  ? executor.promise().query(sql, params)
  : executor.query(sql, params);

let schemaReadyPromise = null;

async function ensureSchema() {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    await db.promise().query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id BIGINT NOT NULL AUTO_INCREMENT,
        user_id BIGINT NULL,
        action VARCHAR(80) NOT NULL,
        entity_type VARCHAR(80) NULL,
        entity_id VARCHAR(100) NULL,
        description VARCHAR(500) NULL,
        metadata_json JSON NULL,
        ip_address VARCHAR(80) NULL,
        user_agent VARCHAR(500) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_activity_created_at (created_at),
        KEY idx_activity_user (user_id, created_at),
        KEY idx_activity_entity (entity_type, entity_id, created_at),
        KEY idx_activity_action (action, created_at)
      )
    `);

    // Báo cáo đã duyệt dùng soft-delete để có thể xem lịch sử/khôi phục.
    // Các schema KTC cũ dùng ENUM không có 'deleted', vì vậy nới riêng cột
    // production_reports.status sang VARCHAR nếu cần. Không đụng status của temp.
    const [statusColumns] = await db.promise().query(`
      SELECT DATA_TYPE AS data_type, COLUMN_TYPE AS column_type
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'production_reports'
        AND COLUMN_NAME = 'status'
      LIMIT 1
    `);
    const statusColumn = statusColumns[0];
    if (statusColumn && String(statusColumn.data_type || '').toLowerCase() === 'enum'
      && !String(statusColumn.column_type || '').toLowerCase().includes("'deleted'")) {
      await db.promise().query(
        "ALTER TABLE production_reports MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'approved'"
      );
    }

    await db.promise().query(`
      CREATE TABLE IF NOT EXISTS report_versions (
        id BIGINT NOT NULL AUTO_INCREMENT,
        report_type VARCHAR(20) NOT NULL,
        report_id BIGINT NOT NULL,
        version_no INT NOT NULL,
        snapshot_json JSON NOT NULL,
        change_reason VARCHAR(500) NULL,
        created_by BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_report_version (report_type, report_id, version_no),
        KEY idx_report_version_lookup (report_type, report_id, created_at),
        KEY idx_report_version_creator (created_by, created_at)
      )
    `);
  })().catch((error) => {
    schemaReadyPromise = null;
    throw error;
  });

  return schemaReadyPromise;
}

async function logActivity(
  {
    userId = null,
    action,
    entityType = null,
    entityId = null,
    description = null,
    metadata = null,
    req = null,
  },
  executor = db,
) {
  await ensureSchema();
  await query(
    executor,
    `INSERT INTO activity_logs
      (user_id, action, entity_type, entity_id, description, metadata_json, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(userId) || null,
      String(action || 'UNKNOWN').slice(0, 80),
      entityType ? String(entityType).slice(0, 80) : null,
      entityId === null || entityId === undefined ? null : String(entityId).slice(0, 100),
      description ? String(description).slice(0, 500) : null,
      json(metadata),
      req?.ip || null,
      req?.headers?.['user-agent'] || null,
    ],
  );
}

async function createReportVersion(
  {
    reportType,
    reportId,
    snapshot,
    reason = null,
    userId = null,
  },
  executor = db,
) {
  await ensureSchema();

  const [rows] = await query(
    executor,
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version
       FROM report_versions
      WHERE report_type=? AND report_id=?`,
    [reportType, reportId],
  );

  const versionNo = Number(rows[0]?.next_version || 1);

  await query(
    executor,
    `INSERT INTO report_versions
      (report_type, report_id, version_no, snapshot_json, change_reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      String(reportType || 'approved'),
      Number(reportId),
      versionNo,
      json(snapshot),
      reason ? String(reason).slice(0, 500) : null,
      Number(userId) || null,
    ],
  );

  return versionNo;
}

async function notifyUsers(userIds, payload, executor = db) {
  const ids = [...new Set((userIds || [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];

  if (!ids.length) return;

  const values = ids.map(() => '(?,?,?,?,?,?,?)').join(',');
  const params = ids.flatMap((id) => [
    id,
    payload.type || 'info',
    payload.title,
    payload.message,
    payload.linkUrl || null,
    payload.entityType || null,
    payload.entityId || null,
  ]);

  await query(
    executor,
    `INSERT INTO notifications
      (user_id,type,title,message,link_url,entity_type,entity_id)
     VALUES ${values}`,
    params,
  );
}

module.exports = {
  ensureSchema,
  logActivity,
  createReportVersion,
  notifyUsers,
};
