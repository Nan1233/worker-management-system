const db = require('../config/db');

const json = (value) => JSON.stringify(value ?? null);
const query = (executor, sql, params = []) => executor.promise
  ? executor.promise().query(sql, params)
  : executor.query(sql, params);

let schemaReadyPromise = null;

async function ensureSchema(executor = db) {
  // Existing TiDB deployments may predate the notification link/entity columns.
  // Repair only the missing additive columns so notification writes remain compatible.
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const rows = await query(
        executor,
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'notifications'`,
      );
      const columns = new Set(rows.map((row) => String(row.COLUMN_NAME).toLowerCase()));
      const additions = [
        ['link_url', 'VARCHAR(1000) NULL AFTER message'],
        ['entity_type', 'VARCHAR(80) NULL AFTER link_url'],
        ['entity_id', 'BIGINT NULL AFTER entity_type'],
      ];

      for (const [column, definition] of additions) {
        if (columns.has(column)) continue;
        try {
          await query(executor, `ALTER TABLE notifications ADD COLUMN ${column} ${definition}`);
        } catch (error) {
          if (!/duplicate column|already exists/i.test(String(error?.message || ''))) throw error;
        }
      }

      try {
        await query(
          executor,
          'CREATE INDEX idx_notification_entity ON notifications (entity_type, entity_id)',
        );
      } catch (error) {
        if (!/duplicate key name|already exists/i.test(String(error?.message || ''))) throw error;
      }

      return true;
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
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
  await ensureSchema(executor);
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

  const rows = await query(
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

async function loadTempReportSnapshot(reportId, executor = db) {
  const reportRows = await query(
    executor,
    `SELECT * FROM production_reports_temp WHERE id=? LIMIT 1`,
    [Number(reportId)],
  );
  const report = reportRows[0];
  if (!report) return null;

  const [defects, deductions, machineLines] = await Promise.all([
    query(
      executor,
      `SELECT d.id,d.defect_type_id,dt.defect_code,dt.defect_name,d.quantity
         FROM production_temp_defects d
         LEFT JOIN defect_types dt ON dt.id=d.defect_type_id
        WHERE d.temp_report_id=? ORDER BY d.id`,
      [Number(reportId)],
    ),
    query(
      executor,
      `SELECT d.id,d.deduction_type_id,dt.deduction_code,dt.deduction_name,d.hours
         FROM production_temp_deductions d
         LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id
        WHERE d.temp_report_id=? ORDER BY d.id`,
      [Number(reportId)],
    ),
    query(
      executor,
      `SELECT * FROM production_temp_machine_lines
        WHERE temp_report_id=? ORDER BY sort_order,id`,
      [Number(reportId)],
    ),
  ]);

  const machineIds = machineLines.map((line) => Number(line.id)).filter(Boolean);
  let machineDefects = [];
  if (machineIds.length) {
    const rows = await query(
      executor,
      `SELECT * FROM production_temp_machine_defects
        WHERE machine_line_id IN (${machineIds.map(() => '?').join(',')})
        ORDER BY machine_line_id,id`,
      machineIds,
    );
    machineDefects = rows;
  }
  const defectsByMachine = new Map();
  machineDefects.forEach((item) => {
    const key = Number(item.machine_line_id);
    if (!defectsByMachine.has(key)) defectsByMachine.set(key, []);
    defectsByMachine.get(key).push(item);
  });

  return {
    ...report,
    defects,
    deductions,
    machine_lines: machineLines.map((line) => ({
      ...line,
      defects: defectsByMachine.get(Number(line.id)) || [],
    })),
  };
}

async function notifyUsers(userIds, payload, executor = db) {
  const ids = [...new Set((userIds || [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];

  if (!ids.length) return;

  await ensureSchema(executor);

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
  loadTempReportSnapshot,
  notifyUsers,
};
